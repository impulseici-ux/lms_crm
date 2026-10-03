import {
  addDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { whatsappBatchesCol, whatsappBatchDoc, whatsappBatchItemsCol, whatsappBatchItemDoc } from "@/lib/data/collections";
import type { WhatsAppBatchDoc, WhatsAppBatchItemDoc, WhatsAppBatchItemStatus, WhatsAppBatchStatus } from "@/types/whatsapp";

export interface NewBatchItemInput {
  leadId: string;
  leadParentName: string;
  leadChildName: string;
  mobile: string;
  renderedMessage: string;
  valid: boolean; // false (e.g. invalid number) -> created straight into SKIPPED, never opened
}

export interface NewBatchInput {
  createdByStaffId: string;
  messageTemplate: string;
  linkLabel: string | null;
  linkUrl: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  delaySeconds: number;
  items: NewBatchItemInput[];
}

/** Creates the batch doc first (so its id exists), then every item doc in one
 * atomic write — Section 19/20: a batch's items either all exist, or (on failure) none do. */
export async function createWhatsAppBatch(input: NewBatchInput): Promise<string> {
  const validItems = input.items.filter((i) => i.valid);
  const invalidItems = input.items.filter((i) => !i.valid);

  const batchRef = await addDoc(whatsappBatchesCol(), {
    createdByStaffId: input.createdByStaffId,
    status: "running" as WhatsAppBatchStatus,
    mode: "click_to_chat",
    messageTemplate: input.messageTemplate,
    linkLabel: input.linkLabel,
    linkUrl: input.linkUrl,
    attachmentName: input.attachmentName,
    attachmentSize: input.attachmentSize,
    delaySeconds: input.delaySeconds,
    totalCount: input.items.length,
    queuedCount: validItems.length,
    openedCount: 0,
    manuallySentCount: 0,
    failedCount: 0,
    skippedCount: invalidItems.length,
    cancelledCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
  });

  const wb = writeBatch(db);
  input.items.forEach((item, index) => {
    const itemRef = whatsappBatchItemDoc(batchRef.id, item.leadId);
    wb.set(itemRef, {
      leadId: item.leadId,
      leadParentName: item.leadParentName,
      leadChildName: item.leadChildName,
      mobile: item.mobile,
      renderedMessage: item.renderedMessage,
      status: item.valid ? "QUEUED" : "SKIPPED",
      reason: item.valid ? null : "Invalid mobile number",
      order: index,
      startedAt: null,
      completedAt: item.valid ? null : serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await wb.commit();
  return batchRef.id;
}

export function subscribeBatch(batchId: string, onChange: (batch: WhatsAppBatchDoc | null) => void) {
  return onSnapshot(whatsappBatchDoc(batchId), (snap) => {
    onChange(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<WhatsAppBatchDoc, "id">) }) : null);
  });
}

export function subscribeAllWhatsAppBatches(onChange: (items: WhatsAppBatchDoc[]) => void) {
  return onSnapshot(query(whatsappBatchesCol(), orderBy("createdAt", "desc")), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppBatchDoc, "id">) })));
  });
}

export function subscribeMyWhatsAppBatches(uid: string, onChange: (items: WhatsAppBatchDoc[]) => void) {
  return onSnapshot(query(whatsappBatchesCol(), where("createdByStaffId", "==", uid), orderBy("createdAt", "desc")), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppBatchDoc, "id">) })));
  });
}

export function subscribeBatchItems(batchId: string, onChange: (items: WhatsAppBatchItemDoc[]) => void) {
  return onSnapshot(query(whatsappBatchItemsCol(batchId), orderBy("order", "asc")), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppBatchItemDoc, "id">) })));
  });
}

export function updateBatchStatus(batchId: string, status: WhatsAppBatchStatus, opts?: { completed?: boolean }) {
  return updateDoc(whatsappBatchDoc(batchId), {
    status,
    updatedAt: serverTimestamp(),
    ...(opts?.completed ? { completedAt: serverTimestamp() } : {}),
  });
}

const COUNT_FIELD: Record<WhatsAppBatchItemStatus, keyof WhatsAppBatchDoc> = {
  QUEUED: "queuedCount",
  OPENED: "openedCount",
  MANUALLY_SENT: "manuallySentCount",
  FAILED: "failedCount",
  SKIPPED: "skippedCount",
  CANCELLED: "cancelledCount",
};

/** The only way an item's status (and the batch's denormalized counters) may ever
 * change after creation — a transaction, so the two can never drift apart. */
export async function transitionBatchItem(
  batchId: string,
  itemId: string,
  toStatus: WhatsAppBatchItemStatus,
  extra?: { reason?: string | null; markStarted?: boolean; markCompleted?: boolean }
): Promise<void> {
  const batchRef = whatsappBatchDoc(batchId);
  const itemRef = whatsappBatchItemDoc(batchId, itemId);
  await runTransaction(db, async (tx) => {
    const [batchSnap, itemSnap] = await Promise.all([tx.get(batchRef), tx.get(itemRef)]);
    if (!batchSnap.exists() || !itemSnap.exists()) return;
    const fromStatus = itemSnap.data().status as WhatsAppBatchItemStatus;
    if (fromStatus === toStatus) return;

    const fromField = COUNT_FIELD[fromStatus];
    const toField = COUNT_FIELD[toStatus];
    const batchPatch: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
      [fromField]: Math.max(0, (batchSnap.data()[fromField] ?? 0) - 1),
      [toField]: (batchSnap.data()[toField] ?? 0) + 1,
    };
    tx.update(batchRef, batchPatch);

    tx.update(itemRef, {
      status: toStatus,
      reason: extra?.reason ?? null,
      ...(extra?.markStarted ? { startedAt: serverTimestamp() } : {}),
      ...(extra?.markCompleted ? { completedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Transitions every still-QUEUED item of a batch straight to CANCELLED in one
 * transaction — used when a batch is stopped partway through. Never touches an item
 * that's already OPENED/MANUALLY_SENT/FAILED/SKIPPED (Section 20: stopping must never
 * relabel something that already happened). */
export async function cancelRemainingQueuedItems(batchId: string): Promise<void> {
  const snap = await getDocs(query(whatsappBatchItemsCol(batchId), where("status", "==", "QUEUED")));
  if (snap.empty) return;
  await runTransaction(db, async (tx) => {
    const batchRef = whatsappBatchDoc(batchId);
    const batchSnap = await tx.get(batchRef);
    if (!batchSnap.exists()) return;
    tx.update(batchRef, {
      queuedCount: Math.max(0, (batchSnap.data().queuedCount ?? 0) - snap.size),
      cancelledCount: (batchSnap.data().cancelledCount ?? 0) + snap.size,
      updatedAt: serverTimestamp(),
    });
    for (const d of snap.docs) {
      tx.update(whatsappBatchItemDoc(batchId, d.id), { status: "CANCELLED", completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  });
}

/** Section 18 — Retry Failed: resets only the FAILED items of a batch back to QUEUED
 * (clearing their reason) and returns them so the caller can re-run the send loop over
 * exactly that subset. Successful/skipped/cancelled items are never touched. */
export async function resetFailedItemsToQueued(batchId: string): Promise<WhatsAppBatchItemDoc[]> {
  const snap = await getDocs(query(whatsappBatchItemsCol(batchId), where("status", "==", "FAILED")));
  const failedItems = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppBatchItemDoc, "id">) }));
  if (failedItems.length === 0) return [];

  await runTransaction(db, async (tx) => {
    const batchRef = whatsappBatchDoc(batchId);
    const batchSnap = await tx.get(batchRef);
    if (!batchSnap.exists()) return;
    tx.update(batchRef, {
      failedCount: Math.max(0, (batchSnap.data().failedCount ?? 0) - failedItems.length),
      queuedCount: (batchSnap.data().queuedCount ?? 0) + failedItems.length,
      status: "running",
      updatedAt: serverTimestamp(),
    });
    for (const item of failedItems) {
      tx.update(whatsappBatchItemDoc(batchId, item.id), {
        status: "QUEUED",
        reason: null,
        startedAt: null,
        completedAt: null,
        updatedAt: serverTimestamp(),
      });
    }
  });

  return failedItems.map((item) => ({ ...item, status: "QUEUED", reason: null, startedAt: null, completedAt: null }));
}

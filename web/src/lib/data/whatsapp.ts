import {
  addDoc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  whatsappTemplatesCol,
  whatsappTemplateDoc,
  whatsappAutomationsCol,
  whatsappAutomationDoc,
  whatsappMessagesCol,
  whatsappMessageDoc,
  whatsappMessageEventsCol,
  whatsappSettingsDoc,
} from "@/lib/data/collections";
import type {
  WhatsAppTemplateDoc,
  WhatsAppAutomationDoc,
  WhatsAppMessageDoc,
  WhatsAppMessageStatus,
  WhatsAppSettingsDoc,
} from "@/types/whatsapp";

// ---- Templates ----

export function subscribeWhatsAppTemplates(onChange: (items: WhatsAppTemplateDoc[]) => void) {
  return onSnapshot(query(whatsappTemplatesCol(), orderBy("createdAt", "desc")), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppTemplateDoc, "id">) })));
  });
}

export function createWhatsAppTemplate(
  input: Pick<WhatsAppTemplateDoc, "name" | "category" | "language" | "content">,
  createdByStaffId: string
) {
  return addDoc(whatsappTemplatesCol(), {
    ...input,
    active: true,
    createdByStaffId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateWhatsAppTemplate(id: string, patch: Partial<WhatsAppTemplateDoc>) {
  return updateDoc(whatsappTemplateDoc(id), { ...patch, updatedAt: serverTimestamp() });
}

// ---- Automations ----

export function subscribeWhatsAppAutomations(onChange: (items: WhatsAppAutomationDoc[]) => void) {
  return onSnapshot(query(whatsappAutomationsCol(), orderBy("createdAt", "desc")), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppAutomationDoc, "id">) })));
  });
}

export function createWhatsAppAutomation(
  input: Pick<WhatsAppAutomationDoc, "name" | "trigger" | "condition" | "templateId" | "delayMinutes">,
  createdByStaffId: string
) {
  return addDoc(whatsappAutomationsCol(), {
    ...input,
    active: true,
    createdByStaffId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateWhatsAppAutomation(id: string, patch: Partial<WhatsAppAutomationDoc>) {
  return updateDoc(whatsappAutomationDoc(id), { ...patch, updatedAt: serverTimestamp() });
}

// ---- Messages (queue + history are both just this collection, filtered) ----

export function subscribeWhatsAppMessagesForLead(leadId: string, onChange: (items: WhatsAppMessageDoc[]) => void) {
  const q = query(whatsappMessagesCol(), where("leadId", "==", leadId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppMessageDoc, "id">) })));
  });
}

export function subscribeAllWhatsAppMessages(onChange: (items: WhatsAppMessageDoc[]) => void, max = 500) {
  const q = query(whatsappMessagesCol(), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppMessageDoc, "id">) })));
  });
}

export function subscribeMyWhatsAppMessages(assignedStaffId: string, onChange: (items: WhatsAppMessageDoc[]) => void, max = 500) {
  const q = query(whatsappMessagesCol(), where("assignedStaffId", "==", assignedStaffId), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppMessageDoc, "id">) })));
  });
}

/**
 * Creates the message doc at a deterministic id (the idempotency key) only if it doesn't
 * already exist. Returns {created: false} without writing anything if it does — this is
 * the single mechanism that makes every automation trigger safe to fire more than once
 * for the same logical event (Section 12).
 */
export async function createWhatsAppMessageIfAbsent(
  idempotencyKey: string,
  data: Omit<WhatsAppMessageDoc, "id" | "idempotencyKey" | "createdAt" | "updatedAt">
): Promise<{ created: boolean; id: string }> {
  const ref = whatsappMessageDoc(idempotencyKey);
  const created = await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) return false;
    tx.set(ref, {
      ...data,
      idempotencyKey,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  });
  return { created, id: ref.id };
}

export async function getWhatsAppMessage(id: string): Promise<WhatsAppMessageDoc | null> {
  const snap = await getDoc(whatsappMessageDoc(id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<WhatsAppMessageDoc, "id">) }) : null;
}

export function setWhatsAppMessageRendered(id: string, renderedMessage: string) {
  return updateDoc(whatsappMessageDoc(id), { renderedMessage, updatedAt: serverTimestamp() });
}

export async function setWhatsAppMessageStatus(
  id: string,
  status: WhatsAppMessageStatus,
  extra?: { error?: string | null; providerMessageId?: string | null; processedAt?: Timestamp | "now" }
) {
  await updateDoc(whatsappMessageDoc(id), {
    status,
    error: extra?.error ?? null,
    ...(extra?.providerMessageId !== undefined ? { providerMessageId: extra.providerMessageId } : {}),
    ...(extra?.processedAt === "now" ? { processedAt: serverTimestamp() } : extra?.processedAt ? { processedAt: extra.processedAt } : {}),
    updatedAt: serverTimestamp(),
  });
  await addDoc(whatsappMessageEventsCol(id), { status, note: extra?.error ?? null, at: serverTimestamp() });
}

// ---- Settings (single document) ----

const DEFAULT_SETTINGS: Omit<WhatsAppSettingsDoc, "updatedAt"> = {
  schoolName: "Little Millennium Singanallur",
  schoolPhone: "",
  schoolAddress: "",
  futureProvider: null,
  futurePhoneNumberId: null,
  futureBusinessAccountId: null,
};

export function subscribeWhatsAppSettings(onChange: (settings: WhatsAppSettingsDoc) => void) {
  return onSnapshot(whatsappSettingsDoc(), (snap) => {
    onChange(snap.exists() ? (snap.data() as WhatsAppSettingsDoc) : { ...DEFAULT_SETTINGS, updatedAt: null });
  });
}

export async function getWhatsAppSettings(): Promise<WhatsAppSettingsDoc> {
  const snap = await getDoc(whatsappSettingsDoc());
  return snap.exists() ? (snap.data() as WhatsAppSettingsDoc) : { ...DEFAULT_SETTINGS, updatedAt: null };
}

export function updateWhatsAppBusinessProfile(patch: Pick<WhatsAppSettingsDoc, "schoolName" | "schoolPhone" | "schoolAddress">) {
  return setDoc(whatsappSettingsDoc(), { ...DEFAULT_SETTINGS, ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

import {
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { leadsCol, leadDoc, activitiesCol } from "@/lib/data/collections";
import { addActivity } from "@/lib/data/activities";
import { assertFollowUpGuardrail } from "@/lib/guardrail";
import { isOpenStatus, type LeadDoc, type LeadStatus, type Priority, type FollowUpType, type FollowUpOutcome } from "@/types";

export function subscribeLeads(onChange: (leads: LeadDoc[]) => void) {
  const q = query(leadsCol(), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeadDoc, "id">) })));
  });
}

export function subscribeLead(leadId: string, onChange: (lead: LeadDoc | null) => void) {
  return onSnapshot(leadDoc(leadId), (snap) => {
    onChange(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<LeadDoc, "id">) }) : null);
  });
}

export async function getLead(leadId: string): Promise<LeadDoc | null> {
  const snap = await getDoc(leadDoc(leadId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<LeadDoc, "id">) }) : null;
}

export interface NewLeadInput {
  parentName: string;
  parentPhone: string;
  parentEmail?: string | null;
  childName: string;
  childAge?: string | null;
  interestedProgramId?: string | null;
  branchId?: string | null;
  location?: string | null;
  fees?: number | null;
  sourceChannel: string;
  campaignId?: string | null;
  referralName?: string | null;
  howHeardOther?: string | null;
  notes?: string | null;
  priority?: Priority;
  nextFollowUpAt: Timestamp | null;
  nextFollowUpType?: FollowUpType | null;
}

/** Section 10/11 — the fast walk-in / phone form; every other channel funnels through the same create path. */
export async function createLead(input: NewLeadInput, createdByStaffId: string) {
  const status: LeadStatus = "New Lead";
  assertFollowUpGuardrail(status, input.nextFollowUpAt);

  const now = serverTimestamp();
  const docRef = await addDoc(leadsCol(), {
    parentName: input.parentName,
    parentPhone: input.parentPhone,
    parentEmail: input.parentEmail ?? null,
    childName: input.childName,
    childAge: input.childAge ?? null,
    childDob: null,
    interestedProgramId: input.interestedProgramId ?? null,
    branchId: input.branchId ?? null,
    location: input.location ?? null,
    fees: input.fees ?? null,
    sourceChannel: input.sourceChannel,
    campaignId: input.campaignId ?? null,
    utm: null,
    referralName: input.referralName ?? null,
    howHeardOther: input.howHeardOther ?? null,
    status,
    priority: input.priority ?? "Medium",
    assignedStaffId: createdByStaffId,
    createdByStaffId,
    nextFollowUpAt: input.nextFollowUpAt,
    nextFollowUpType: input.nextFollowUpType ?? null,
    lastContactedAt: null,
    lastActivityAt: now,
    visitDate: null,
    visitNotes: null,
    admissionNumber: null,
    admissionFeePlan: null,
    admissionConfirmedAt: null,
    householdId: null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await addActivity(docRef.id, createdByStaffId, {
    type: "lead_created",
    text: `Lead captured via ${input.sourceChannel}.`,
  });

  if (input.nextFollowUpAt) {
    await addActivity(docRef.id, createdByStaffId, {
      type: "follow_up_planned",
      dueAt: input.nextFollowUpAt,
      followUpType: input.nextFollowUpType ?? null,
    });
  }

  return docRef.id;
}

/** Change pipeline status; writes a status_change activity entry. */
export async function changeLeadStatus(
  lead: LeadDoc,
  toStatus: LeadStatus,
  byStaffId: string,
  opts?: { nextFollowUpAt?: Timestamp | null; nextFollowUpType?: FollowUpType | null }
) {
  const nextFollowUpAt = opts?.nextFollowUpAt !== undefined ? opts.nextFollowUpAt : lead.nextFollowUpAt;
  assertFollowUpGuardrail(toStatus, nextFollowUpAt);

  await updateDoc(leadDoc(lead.id), {
    status: toStatus,
    nextFollowUpAt,
    nextFollowUpType: opts?.nextFollowUpType !== undefined ? opts.nextFollowUpType : lead.nextFollowUpType,
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addActivity(lead.id, byStaffId, {
    type: "status_change",
    fromStatus: lead.status,
    toStatus,
  });
}

/** Set/edit the next follow-up in place (Section 9 "Next action"). */
export async function scheduleFollowUp(
  lead: LeadDoc,
  dueAt: Timestamp,
  type: FollowUpType,
  plannedNotes: string | null,
  byStaffId: string
) {
  await updateDoc(leadDoc(lead.id), {
    nextFollowUpAt: dueAt,
    nextFollowUpType: type,
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addActivity(lead.id, byStaffId, {
    type: "follow_up_planned",
    dueAt,
    followUpType: type,
    plannedNotes,
  });
}

/**
 * Log the outcome of a follow-up. Per Section 6, completing one should
 * prompt for the next so the chain never breaks — the caller (UI) is
 * expected to immediately call scheduleFollowUp unless the lead is closed.
 */
export async function logFollowUpOutcome(
  lead: LeadDoc,
  outcome: FollowUpOutcome,
  outcomeNotes: string | null,
  byStaffId: string
) {
  await updateDoc(leadDoc(lead.id), {
    lastContactedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addActivity(lead.id, byStaffId, {
    type: "follow_up_outcome",
    outcome,
    outcomeNotes,
  });
}

export async function logContact(
  lead: LeadDoc,
  kind: "call_logged" | "whatsapp_logged",
  byStaffId: string,
  text?: string | null
) {
  await updateDoc(leadDoc(lead.id), {
    lastContactedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addActivity(lead.id, byStaffId, { type: kind, text: text ?? null });
}

export async function addNote(lead: LeadDoc, text: string, byStaffId: string) {
  await updateDoc(leadDoc(lead.id), {
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addActivity(lead.id, byStaffId, { type: "note", text });
}

export async function recordVisit(
  lead: LeadDoc,
  visitDate: Timestamp,
  visitNotes: string | null,
  byStaffId: string
) {
  await updateDoc(leadDoc(lead.id), {
    visitDate,
    visitNotes,
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addActivity(lead.id, byStaffId, { type: "visit", visitDate, visitNotes });
}

export async function confirmAdmission(
  lead: LeadDoc,
  admissionNumber: string,
  admissionFeePlan: string | null,
  byStaffId: string
) {
  await updateDoc(leadDoc(lead.id), {
    status: "Admission Confirmed",
    admissionNumber,
    admissionFeePlan,
    admissionConfirmedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addActivity(lead.id, byStaffId, {
    type: "status_change",
    fromStatus: lead.status,
    toStatus: "Admission Confirmed",
  });
}

/** Section 7 — admin-only reassignment, written as an immutable activity entry. */
export async function reassignLead(
  lead: LeadDoc,
  toStaffId: string,
  reason: string | null,
  byStaffId: string
) {
  await runTransaction(db, async (tx) => {
    tx.update(leadDoc(lead.id), {
      assignedStaffId: toStaffId,
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await addActivity(lead.id, byStaffId, {
    type: "reassignment",
    fromStaffId: lead.assignedStaffId,
    toStaffId,
    reason,
  });
}

export async function updateLeadFields(leadId: string, patch: Partial<LeadDoc>) {
  await updateDoc(leadDoc(leadId), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteLead(leadId: string) {
  await deleteDoc(leadDoc(leadId));
}

export function leadRef(leadId: string) {
  return doc(db, "leads", leadId);
}

export interface BulkSkip {
  leadId: string;
  label: string;
  reason: string;
}

export interface BulkResult {
  updatedCount: number;
  skipped: BulkSkip[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Bulk status change — same guardrail as a single lead: an open target status needs an existing next follow-up date. */
export async function bulkChangeStatus(leads: LeadDoc[], toStatus: LeadStatus, byStaffId: string): Promise<BulkResult> {
  const result: BulkResult = { updatedCount: 0, skipped: [] };
  const eligible: LeadDoc[] = [];
  for (const lead of leads) {
    if (lead.status === toStatus) {
      result.skipped.push({ leadId: lead.id, label: `${lead.parentName} · ${lead.childName}`, reason: "Already in this status" });
    } else if (isOpenStatus(toStatus) && !lead.nextFollowUpAt) {
      result.skipped.push({ leadId: lead.id, label: `${lead.parentName} · ${lead.childName}`, reason: "No next follow-up date set" });
    } else {
      eligible.push(lead);
    }
  }

  for (const group of chunk(eligible, 150)) {
    const batch = writeBatch(db);
    for (const lead of group) {
      batch.update(leadDoc(lead.id), { status: toStatus, lastActivityAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(activitiesCol(lead.id)), {
        type: "status_change",
        byStaffId,
        at: serverTimestamp(),
        fromStatus: lead.status,
        toStatus,
      });
    }
    await batch.commit();
    result.updatedCount += group.length;
  }
  return result;
}

/** Bulk reassignment — admin-only in the UI; each reassignment still gets its own immutable activity entry. */
export async function bulkReassign(leads: LeadDoc[], toStaffId: string, reason: string | null, byStaffId: string): Promise<BulkResult> {
  const result: BulkResult = { updatedCount: 0, skipped: [] };
  const eligible = leads.filter((lead) => {
    if (lead.assignedStaffId === toStaffId) {
      result.skipped.push({ leadId: lead.id, label: `${lead.parentName} · ${lead.childName}`, reason: "Already assigned to this staff member" });
      return false;
    }
    return true;
  });

  for (const group of chunk(eligible, 150)) {
    const batch = writeBatch(db);
    for (const lead of group) {
      batch.update(leadDoc(lead.id), { assignedStaffId: toStaffId, lastActivityAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(activitiesCol(lead.id)), {
        type: "reassignment",
        byStaffId,
        at: serverTimestamp(),
        fromStaffId: lead.assignedStaffId,
        toStaffId,
        reason,
      });
    }
    await batch.commit();
    result.updatedCount += group.length;
  }
  return result;
}

export interface ImportRow extends NewLeadInput {
  assignedStaffId?: string | null;
}

export interface ImportResult {
  createdCount: number;
  leadIds: string[];
}

/** CSV import — every row goes through the exact same guardrail as a manually-created lead. */
export async function createLeadsBatch(rows: ImportRow[], importedByStaffId: string): Promise<ImportResult> {
  const leadIds: string[] = [];
  for (const group of chunk(rows, 100)) {
    const batch = writeBatch(db);
    for (const row of group) {
      const status: LeadStatus = "New Lead";
      assertFollowUpGuardrail(status, row.nextFollowUpAt);
      const leadRefNew = doc(leadsCol());
      const now = serverTimestamp();
      const assignedStaffId = row.assignedStaffId ?? importedByStaffId;
      batch.set(leadRefNew, {
        parentName: row.parentName,
        parentPhone: row.parentPhone,
        parentEmail: row.parentEmail ?? null,
        childName: row.childName,
        childAge: row.childAge ?? null,
        childDob: null,
        interestedProgramId: row.interestedProgramId ?? null,
        branchId: row.branchId ?? null,
        location: row.location ?? null,
        fees: row.fees ?? null,
        sourceChannel: row.sourceChannel,
        campaignId: row.campaignId ?? null,
        utm: null,
        referralName: row.referralName ?? null,
        howHeardOther: row.howHeardOther ?? null,
        status,
        priority: row.priority ?? "Medium",
        assignedStaffId,
        createdByStaffId: importedByStaffId,
        nextFollowUpAt: row.nextFollowUpAt,
        nextFollowUpType: row.nextFollowUpType ?? null,
        lastContactedAt: null,
        lastActivityAt: now,
        visitDate: null,
        visitNotes: null,
        admissionNumber: null,
        admissionFeePlan: null,
        admissionConfirmedAt: null,
        householdId: null,
        notes: row.notes ?? null,
        createdAt: now,
        updatedAt: now,
      });
      batch.set(doc(activitiesCol(leadRefNew.id)), {
        type: "lead_created",
        byStaffId: importedByStaffId,
        at: now,
        text: `Imported via CSV upload (source: ${row.sourceChannel}).`,
      });
      if (row.nextFollowUpAt) {
        batch.set(doc(activitiesCol(leadRefNew.id)), {
          type: "follow_up_planned",
          byStaffId: importedByStaffId,
          at: now,
          dueAt: row.nextFollowUpAt,
          followUpType: row.nextFollowUpType ?? null,
        });
      }
      leadIds.push(leadRefNew.id);
    }
    await batch.commit();
  }
  return { createdCount: leadIds.length, leadIds };
}

import { addDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { feeStructuresCol, feeStructureDoc, activeFeeStructureDoc } from "@/lib/data/collections";
import type { FeeStructureDoc } from "@/types";

export function subscribeFeeStructures(onChange: (items: FeeStructureDoc[]) => void) {
  return onSnapshot(query(feeStructuresCol(), orderBy("createdAt", "desc")), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeeStructureDoc, "id">) })));
  });
}

export interface FeeStructureInput {
  name: string;
  admissionTypeId: string;
  academicYearId: string;
  classFees: Record<string, number>;
}

function assertValidClassFees(classFees: Record<string, number>) {
  const entries = Object.entries(classFees);
  if (entries.length === 0) throw new Error("Add at least one class fee.");
  for (const [classId, fee] of entries) {
    if (!classId) throw new Error("Each class fee needs a class selected.");
    if (!Number.isFinite(fee) || fee < 0) throw new Error("Class fees must be valid, non-negative amounts.");
  }
}

/** Always created as a draft (Section 4 — "Creating or editing a draft must never
 * activate it automatically"). Activation is a separate, explicit step below. */
export async function createFeeStructure(input: FeeStructureInput, uid: string): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter a structure name.");
  if (!input.admissionTypeId) throw new Error("Select an admission type.");
  if (!input.academicYearId) throw new Error("Select an academic year.");
  assertValidClassFees(input.classFees);

  const ref = await addDoc(feeStructuresCol(), {
    name,
    admissionTypeId: input.admissionTypeId,
    academicYearId: input.academicYearId,
    classFees: input.classFees,
    status: "draft",
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    activatedBy: null,
    activatedAt: null,
    deactivatedBy: null,
    deactivatedAt: null,
  });
  return ref.id;
}

/** Only a draft's name/classFees may change — firestore.rules enforces this too, so an
 * already-active structure (possibly already relied on by confirmed admissions) can
 * never be edited in place; deactivate and create a corrected draft instead. */
export async function updateFeeStructureDraft(
  structure: FeeStructureDoc,
  patch: { name?: string; classFees?: Record<string, number> },
  uid: string
) {
  if (structure.status !== "draft") {
    throw new Error("Only a draft structure can be edited. Deactivate it and duplicate to make changes.");
  }
  const name = patch.name?.trim();
  if (name !== undefined && !name) throw new Error("Enter a structure name.");
  if (patch.classFees) assertValidClassFees(patch.classFees);

  await updateDoc(feeStructureDoc(structure.id), {
    ...(name !== undefined && { name }),
    ...(patch.classFees && { classFees: patch.classFees }),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

/** Starting point for a new structure without activating it (Section 4, item 11). */
export async function duplicateFeeStructure(structure: FeeStructureDoc, uid: string): Promise<string> {
  return createFeeStructure(
    { name: `${structure.name} (copy)`, admissionTypeId: structure.admissionTypeId, academicYearId: structure.academicYearId, classFees: { ...structure.classFees } },
    uid
  );
}

/**
 * Activating writes the deterministic `activeFeeStructures/{admissionTypeId_academicYearId}`
 * pointer in the same batch as the status flip — the pointer document can only be
 * *created*, never overwritten (firestore.rules denies `update`), so a second
 * activation attempt for the same admission type + academic year fails outright
 * instead of silently replacing the first (Section 4, item 7 / Section 5).
 */
export async function activateFeeStructure(structure: FeeStructureDoc, uid: string) {
  if (structure.status !== "draft" && structure.status !== "inactive") {
    throw new Error("Only a draft or inactive structure can be activated.");
  }
  assertValidClassFees(structure.classFees);
  const batch = writeBatch(db);
  batch.set(activeFeeStructureDoc(structure.admissionTypeId, structure.academicYearId), {
    feeStructureId: structure.id,
    setBy: uid,
    setAt: serverTimestamp(),
  });
  batch.update(feeStructureDoc(structure.id), { status: "active", activatedBy: uid, activatedAt: serverTimestamp() });
  try {
    await batch.commit();
  } catch {
    throw new Error("Another active structure already exists for this admission type and academic year — deactivate it first.");
  }
}

export async function deactivateFeeStructure(structure: FeeStructureDoc, uid: string) {
  if (structure.status !== "active") throw new Error("Only an active structure can be deactivated.");
  const batch = writeBatch(db);
  batch.delete(activeFeeStructureDoc(structure.admissionTypeId, structure.academicYearId));
  batch.update(feeStructureDoc(structure.id), { status: "inactive", deactivatedBy: uid, deactivatedAt: serverTimestamp() });
  await batch.commit();
}

export async function archiveFeeStructure(structure: FeeStructureDoc, uid: string) {
  if (structure.status === "active") throw new Error("Deactivate an active structure before archiving it.");
  await updateDoc(feeStructureDoc(structure.id), { status: "archived", updatedBy: uid, updatedAt: serverTimestamp() });
}

export interface ApplicableFee {
  totalFee: number;
  feeStructureId: string;
}

/**
 * The one authoritative lookup every admission conversion must go through (Section 5)
 * — never duplicated per-component. Firestore rules re-run the equivalent check at
 * write time (see firestore.rules' leads update rule), so a tampered client-side
 * value can never be persisted even if this function is bypassed.
 */
export async function getApplicableTotalFee(admissionTypeId: string, academicYearId: string, classId: string): Promise<ApplicableFee> {
  if (!admissionTypeId || !academicYearId || !classId) {
    throw new Error("Select an admission type, academic year and class to look up the fee.");
  }
  const pointerSnap = await getDoc(activeFeeStructureDoc(admissionTypeId, academicYearId));
  if (!pointerSnap.exists()) {
    throw new Error("No active fee structure is configured for this admission type and academic year.");
  }
  const feeStructureId = pointerSnap.data().feeStructureId as string;
  const structureSnap = await getDoc(feeStructureDoc(feeStructureId));
  if (!structureSnap.exists() || structureSnap.data().status !== "active") {
    throw new Error("No active fee structure is configured for this admission type and academic year.");
  }
  const classFees = (structureSnap.data() as Omit<FeeStructureDoc, "id">).classFees;
  const totalFee = classFees[classId];
  if (totalFee === undefined || totalFee === null) {
    throw new Error("No fee is configured for this class in the active fee structure.");
  }
  return { totalFee, feeStructureId };
}

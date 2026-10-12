import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { leadSourcesCol, programsCol, branchesCol, campaignsCol, auditLogCol } from "@/lib/data/collections";
import type { LeadSourceDoc, ProgramDoc, BranchDoc, CampaignDoc } from "@/types";

const CONFIG_LABEL: Record<"leadSources" | "programs" | "branches" | "campaigns", string> = {
  leadSources: "Lead Source",
  programs: "Program",
  branches: "Branch",
  campaigns: "Campaign",
};

function logConfigChange(byStaffId: string, byDisplayName: string | null, details: string) {
  return addDoc(auditLogCol(), { type: "config_changed", byStaffId, byDisplayName, at: serverTimestamp(), details });
}

function watchSimpleCollection<T extends { id: string }>(
  col: ReturnType<typeof leadSourcesCol>,
  onChange: (items: T[]) => void
) {
  return onSnapshot(query(col, orderBy("sortOrder", "asc")), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, "id">) })) as T[]);
  });
}

export const subscribeLeadSources = (onChange: (items: LeadSourceDoc[]) => void) =>
  watchSimpleCollection<LeadSourceDoc>(leadSourcesCol(), onChange);

export const subscribePrograms = (onChange: (items: ProgramDoc[]) => void) =>
  watchSimpleCollection<ProgramDoc>(programsCol(), onChange);

export function subscribeBranches(onChange: (items: BranchDoc[]) => void) {
  return onSnapshot(branchesCol(), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BranchDoc, "id">) })));
  });
}

export function subscribeCampaigns(onChange: (items: CampaignDoc[]) => void) {
  return onSnapshot(campaignsCol(), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CampaignDoc, "id">) })));
  });
}

export async function addLeadSource(name: string, sortOrder: number, byStaffId: string, byDisplayName: string | null) {
  await addDoc(leadSourcesCol(), { name, active: true, sortOrder });
  await logConfigChange(byStaffId, byDisplayName, `Added ${CONFIG_LABEL.leadSources} "${name}"`);
}
export async function addProgram(name: string, sortOrder: number, byStaffId: string, byDisplayName: string | null) {
  await addDoc(programsCol(), { name, active: true, sortOrder });
  await logConfigChange(byStaffId, byDisplayName, `Added ${CONFIG_LABEL.programs} "${name}"`);
}
export async function addBranch(name: string, byStaffId: string, byDisplayName: string | null) {
  await addDoc(branchesCol(), { name, active: true });
  await logConfigChange(byStaffId, byDisplayName, `Added ${CONFIG_LABEL.branches} "${name}"`);
}
export async function addCampaign(
  name: string,
  channels: string[],
  startDate: CampaignDoc["startDate"],
  endDate: CampaignDoc["endDate"],
  notes: string | null,
  byStaffId: string,
  byDisplayName: string | null
) {
  await addDoc(campaignsCol(), { name, channels, startDate, endDate, notes, active: true, createdAt: serverTimestamp() });
  await logConfigChange(byStaffId, byDisplayName, `Added ${CONFIG_LABEL.campaigns} "${name}"`);
}

export async function setActive(
  collectionName: "leadSources" | "programs" | "branches" | "campaigns",
  id: string,
  active: boolean,
  name: string,
  byStaffId: string,
  byDisplayName: string | null
) {
  await updateDoc(doc(db, collectionName, id), { active });
  await logConfigChange(byStaffId, byDisplayName, `${active ? "Activated" : "Deactivated"} ${CONFIG_LABEL[collectionName]} "${name}"`);
}

export const removeLookup = (collectionName: "leadSources" | "programs" | "branches" | "campaigns", id: string) =>
  deleteDoc(doc(db, collectionName, id));

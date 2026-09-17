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
import { leadSourcesCol, programsCol, branchesCol, campaignsCol } from "@/lib/data/collections";
import type { LeadSourceDoc, ProgramDoc, BranchDoc, CampaignDoc } from "@/types";

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

export const addLeadSource = (name: string, sortOrder: number) =>
  addDoc(leadSourcesCol(), { name, active: true, sortOrder });
export const addProgram = (name: string, sortOrder: number) =>
  addDoc(programsCol(), { name, active: true, sortOrder });
export const addBranch = (name: string) => addDoc(branchesCol(), { name, active: true });
export const addCampaign = (
  name: string,
  channels: string[],
  startDate: CampaignDoc["startDate"],
  endDate: CampaignDoc["endDate"],
  notes: string | null
) =>
  addDoc(campaignsCol(), {
    name,
    channels,
    startDate,
    endDate,
    notes,
    active: true,
    createdAt: serverTimestamp(),
  });

export const setActive = (collectionName: "leadSources" | "programs" | "branches" | "campaigns", id: string, active: boolean) =>
  updateDoc(doc(db, collectionName, id), { active });

export const removeLookup = (collectionName: "leadSources" | "programs" | "branches" | "campaigns", id: string) =>
  deleteDoc(doc(db, collectionName, id));

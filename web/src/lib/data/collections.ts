import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const leadsCol = () => collection(db, "leads");
export const leadDoc = (id: string) => doc(db, "leads", id);
export const activitiesCol = (leadId: string) => collection(db, "leads", leadId, "activities");

export const usersCol = () => collection(db, "users");
export const userDoc = (uid: string) => doc(db, "users", uid);
export const userActivationDoc = (uid: string) => doc(db, "userActivations", uid);

export const leadSourcesCol = () => collection(db, "leadSources");
export const programsCol = () => collection(db, "programs");
export const branchesCol = () => collection(db, "branches");
export const campaignsCol = () => collection(db, "campaigns");

// Google Sheets → Meta Ads lead sync (written by scripts/sync-google-sheets-leads.mjs
// via the Admin SDK; the app only ever reads these).
export const syncConfigDoc = () => doc(db, "integrations", "googleSheetsSync");
export const syncRunsCol = () => collection(db, "integrations", "googleSheetsSync", "runs");
export const metaLeadSyncLedgerCol = () => collection(db, "metaLeadSyncLedger");

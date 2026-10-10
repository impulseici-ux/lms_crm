import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const leadsCol = () => collection(db, "leads");
export const leadDoc = (id: string) => doc(db, "leads", id);
export const activitiesCol = (leadId: string) => collection(db, "leads", leadId, "activities");

export const usersCol = () => collection(db, "users");
export const userDoc = (uid: string) => doc(db, "users", uid);
export const userActivationDoc = (uid: string) => doc(db, "userActivations", uid);

export const auditLogCol = () => collection(db, "auditLog");

export const leadSourcesCol = () => collection(db, "leadSources");
export const programsCol = () => collection(db, "programs");
export const programDoc = (id: string) => doc(db, "programs", id);
export const branchesCol = () => collection(db, "branches");
export const campaignsCol = () => collection(db, "campaigns");

// Google Sheets → Meta Ads lead sync (written by scripts/sync-google-sheets-leads.mjs
// via the Admin SDK; the app only ever reads these).
export const syncConfigDoc = () => doc(db, "integrations", "googleSheetsSync");
export const syncRunsCol = () => collection(db, "integrations", "googleSheetsSync", "runs");
export const metaLeadSyncLedgerCol = () => collection(db, "metaLeadSyncLedger");

// WhatsApp Automation
export const whatsappTemplatesCol = () => collection(db, "whatsappTemplates");
export const whatsappTemplateDoc = (id: string) => doc(db, "whatsappTemplates", id);
export const whatsappAutomationsCol = () => collection(db, "whatsappAutomations");
export const whatsappAutomationDoc = (id: string) => doc(db, "whatsappAutomations", id);
export const whatsappMessagesCol = () => collection(db, "whatsappMessages");
export const whatsappMessageDoc = (id: string) => doc(db, "whatsappMessages", id);
export const whatsappMessageEventsCol = (messageId: string) => collection(db, "whatsappMessages", messageId, "events");
export const whatsappSettingsDoc = () => doc(db, "whatsappSettings", "config");

// WhatsApp Batch Messaging (Click-to-Chat today, same shape reused by a future provider)
export const whatsappBatchesCol = () => collection(db, "whatsappBatches");
export const whatsappBatchDoc = (id: string) => doc(db, "whatsappBatches", id);
export const whatsappBatchItemsCol = (batchId: string) => collection(db, "whatsappBatches", batchId, "items");
export const whatsappBatchItemDoc = (batchId: string, itemId: string) => doc(db, "whatsappBatches", batchId, "items", itemId);

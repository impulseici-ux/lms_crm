import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "counsellor" | "management";

export interface UserDoc {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  branchId: string | null;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Section 5 — seven sequential open pipeline stages. */
export const OPEN_STATUSES = [
  "New Lead",
  "Contacted",
  "Interested",
  "Visit Scheduled",
  "Visit Completed",
  "Admission Discussion",
  "Admission Confirmed",
] as const;

/** Section 5 — six closed statuses, reachable from any open stage. */
export const CLOSED_STATUSES = [
  "Not Interested",
  "Not Reachable",
  "Wrong/Invalid Number",
  "Future Requirement",
  "Lost to Competitor",
  "Duplicate",
] as const;

export type OpenStatus = (typeof OPEN_STATUSES)[number];
export type ClosedStatus = (typeof CLOSED_STATUSES)[number];
export type LeadStatus = OpenStatus | ClosedStatus;

export function isOpenStatus(status: string): status is OpenStatus {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

export function isClosedStatus(status: string): status is ClosedStatus {
  return (CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Closed statuses that represent a genuine loss vs. a nurture bucket (Section 5). */
export const REOPENABLE_CLOSED_STATUSES: ClosedStatus[] = [
  "Not Reachable",
  "Future Requirement",
];

export type Priority = "High" | "Medium" | "Low";

/** Section 4 — recommended channel list. Seeded into `leadSources`, editable by admin. */
export const DEFAULT_SOURCE_CHANNELS = [
  "Walk-in",
  "Phone Call",
  "WhatsApp",
  "Website — Enquiry Form",
  "Website — Organic Search",
  "Instagram",
  "Facebook",
  "Google Ads",
  "Meta Ads",
  "Referral — Existing Parent",
  "Referral — Staff",
  "Other / Manual",
] as const;

export interface LeadSourceDoc {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface ProgramDoc {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface BranchDoc {
  id: string;
  name: string;
  active: boolean;
}

export interface CampaignDoc {
  id: string;
  name: string;
  channels: string[];
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  notes: string | null;
  active: boolean;
  createdAt: Timestamp | null;
}

export interface Utm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

/** The core record — Section 16. */
export interface LeadDoc {
  id: string;

  // Parent
  parentName: string;
  parentPhone: string;
  parentEmail: string | null;

  // Child
  childName: string;
  childAge: string | null;
  childDob: Timestamp | null;

  interestedProgramId: string | null;
  branchId: string | null;
  location: string | null; // free-text area/locality, distinct from branchId
  fees: number | null; // quoted/agreed fee amount, in rupees

  sourceChannel: string;
  campaignId: string | null;
  utm: Utm | null;
  referralName: string | null; // Section 4 — referring parent / staff name
  howHeardOther: string | null; // free text when sourceChannel = "Other / Manual"

  // Google Sheets → Meta Ads sync provenance. Null for every manually/CSV-created lead.
  externalLeadId: string | null;
  metaAds: MetaAdsInfo | null;

  status: LeadStatus;
  priority: Priority;

  assignedStaffId: string | null;
  createdByStaffId: string | null;

  // Follow-up (Section 6) — the ONE field staff set; state is derived, not stored.
  nextFollowUpAt: Timestamp | null;
  nextFollowUpType: FollowUpType | null;
  lastContactedAt: Timestamp | null;
  lastActivityAt: Timestamp | null;

  // Visit & admission — inline fields (Section 16, "deliberately not separate collections")
  visitDate: Timestamp | null;
  visitNotes: string | null;
  admissionNumber: string | null;
  admissionFeePlan: string | null;
  admissionConfirmedAt: Timestamp | null;

  householdId: string | null; // links sibling enquiries

  notes: string | null; // pinned internal note, staff-only

  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type FollowUpType =
  | "Call"
  | "WhatsApp"
  | "Visit Reminder"
  | "Email"
  | "In-Person"
  | "Other";

export type FollowUpOutcome =
  | "Reached"
  | "No Answer"
  | "Rescheduled"
  | "Not Interested"
  | "Converted to Visit";

/** Derived follow-up state (Section 6) — never stored, always computed. */
export type FollowUpState = "Overdue" | "Due Today" | "Upcoming" | "None Set";

/**
 * Section 16 — one type-discriminated, append-only subcollection instead of
 * five. Every entry is "something that happened to this lead at a point in
 * time"; the lead profile renders them newest-first as a single feed.
 */
export type ActivityType =
  | "follow_up_planned"
  | "follow_up_outcome"
  | "note"
  | "status_change"
  | "reassignment"
  | "visit"
  | "call_logged"
  | "whatsapp_logged"
  | "lead_created";

export interface ActivityDoc {
  id: string;
  type: ActivityType;
  byStaffId: string;
  at: Timestamp | null;

  // follow_up_planned
  dueAt?: Timestamp | null;
  followUpType?: FollowUpType | null;
  plannedNotes?: string | null;

  // follow_up_outcome
  outcome?: FollowUpOutcome | null;
  outcomeNotes?: string | null;

  // note
  text?: string | null;

  // status_change
  fromStatus?: LeadStatus | null;
  toStatus?: LeadStatus | null;

  // reassignment
  fromStaffId?: string | null;
  toStaffId?: string | null;
  reason?: string | null;

  // visit
  visitDate?: Timestamp | null;
  visitNotes?: string | null;
}

/** Raw Meta Lead Ads context, preserved for campaign-performance analysis (Section: Google Sheets sync). */
export interface MetaAdsInfo {
  formName: string | null;
  adSetName: string | null;
  adName: string | null;
  platform: string | null;
}

/** Per-row outcome recorded in `metaLeadSyncLedger/{externalLeadId}` — the sync's dedupe/idempotency ledger. */
export type SyncLedgerStatus = "synced" | "duplicate" | "failed";

export interface SyncLedgerDoc {
  id: string; // == externalLeadId
  status: SyncLedgerStatus;
  leadId: string | null;
  sheetRow: number | null;
  reason: string | null; // populated when status === "failed"
  syncedAt: Timestamp | null;
  lastAttemptAt: Timestamp | null;
}

/** One doc per sync execution, written to `integrations/googleSheetsSync/runs/{runId}`. */
export interface SyncRunDoc {
  id: string;
  status: "success" | "failed";
  triggeredBy: "schedule" | "manual" | "initial";
  startedAt: Timestamp | null;
  finishedAt: Timestamp | null;
  rowsFound: number;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  failedRows: { row: number; reason: string }[];
  error: string | null; // set only if the whole run crashed before processing rows
}

/** Singleton config/status doc at `integrations/googleSheetsSync`. */
export interface SyncConfigDoc {
  spreadsheetId: string | null;
  sheetName: string | null;
  columnMapping: Record<string, string> | null; // optional override of the script's default header aliases
  lastSyncAt: Timestamp | null;
  lastSyncStatus: "success" | "failed" | null;
  totalImported: number;
  totalDuplicates: number;
  totalFailed: number;
}

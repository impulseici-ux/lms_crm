import type { Timestamp } from "firebase/firestore";
import type { LeadStatus } from "@/types";

// ---------------------------------------------------------------------------
// Provider-independent WhatsApp domain types. Nothing in here, or in anything
// that consumes it, may assume a specific WhatsApp provider exists — see
// web/src/lib/whatsapp/provider.ts for the provider abstraction itself.
// ---------------------------------------------------------------------------

export type WhatsAppProviderName = "development" | "meta";

// The full lifecycle a message can pass through. Development Mode only ever
// produces the first group; SENT/DELIVERED/READ are reserved for a real
// provider (e.g. Meta) and must never be set by client code today.
export type WhatsAppMessageStatus =
  | "DRAFT"
  | "QUEUED"
  | "PROCESSING"
  | "SIMULATED"
  | "PENDING_PROVIDER"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "CANCELLED"
  | "MANUAL_OPENED"; // "Open WhatsApp" was clicked — a human still has to hit send themselves

export const TERMINAL_MESSAGE_STATUSES: WhatsAppMessageStatus[] = [
  "SIMULATED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "CANCELLED",
  "MANUAL_OPENED",
];

export type WhatsAppAutomationTrigger =
  | "new_lead_created"
  | "lead_stage_changed"
  | "visit_scheduled"
  | "visit_completed"
  | "follow_up_due"
  | "follow_up_overdue"
  | "admission_discussion"
  | "admission_confirmed"
  | "lead_assigned"
  | "manual_trigger";

export const AUTOMATION_TRIGGER_LABELS: Record<WhatsAppAutomationTrigger, string> = {
  new_lead_created: "New Lead Created",
  lead_stage_changed: "Lead Stage Changed",
  visit_scheduled: "Visit Scheduled",
  visit_completed: "Visit Completed",
  follow_up_due: "Follow-up Due",
  follow_up_overdue: "Follow-up Overdue",
  admission_discussion: "Admission Discussion",
  admission_confirmed: "Admission Confirmed",
  lead_assigned: "Lead Assigned",
  manual_trigger: "Manual Trigger",
};

export type WhatsAppOptStatus = "Allowed" | "Opted Out" | "Unknown";

// What the automation engine actually needs from a lead — deliberately narrower than
// the full LeadDoc so a trigger firing right after a raw addDoc/batch.set (before the
// caller has a full LeadDoc back) doesn't need an extra read just to build this.
// Any real LeadDoc already satisfies this structurally.
export interface AutomationLeadContext {
  id: string;
  parentName: string;
  childName: string;
  parentPhone: string;
  interestedProgramId: string | null;
  status: LeadStatus;
  sourceChannel: string;
  visitDate: Timestamp | null;
  assignedStaffId: string | null;
  nextFollowUpAt: Timestamp | null;
  whatsappOptStatus?: WhatsAppOptStatus;
}

export const WHATSAPP_TEMPLATE_VARIABLES = [
  "parent_name",
  "child_name",
  "mobile",
  "course",
  "stage",
  "lead_source",
  "visit_date",
  "visit_time",
  "staff_name",
  "followup_date",
  "followup_time",
  "school_name",
  "school_phone",
  "school_address",
] as const;
export type WhatsAppTemplateVariable = (typeof WHATSAPP_TEMPLATE_VARIABLES)[number];

export type WhatsAppTemplateCategory =
  | "New Lead"
  | "Visit"
  | "Follow-up"
  | "Admission"
  | "General";

export interface WhatsAppTemplateDoc {
  id: string;
  name: string;
  category: WhatsAppTemplateCategory;
  language: string; // e.g. "English" — free text, not validated against a provider's approved-language list (no provider yet)
  content: string; // raw text with {{variable}} placeholders
  active: boolean;
  createdByStaffId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface WhatsAppAutomationCondition {
  requireValidNumber?: boolean; // default true everywhere this matters
  fromStatus?: LeadStatus | null; // only for lead_stage_changed
  toStatus?: LeadStatus | null; // only for lead_stage_changed
  // visit_scheduled only (Section 13/14) — schedules the message for N days before
  // the lead's visitDate (at 10:00 local time) instead of delayMinutes after the
  // trigger fires, e.g. a "see you tomorrow" reminder sent the day before the visit.
  reminderDaysBeforeVisit?: number | null;
}

export interface WhatsAppAutomationDoc {
  id: string;
  name: string;
  trigger: WhatsAppAutomationTrigger;
  condition: WhatsAppAutomationCondition;
  templateId: string;
  delayMinutes: number; // 0 = immediately
  active: boolean;
  createdByStaffId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type WhatsAppMessageOrigin = "automated" | "manual";

export interface WhatsAppMessageDoc {
  id: string;
  leadId: string;
  leadChildName: string; // denormalized so queue/history tables don't need a lookup per row
  leadParentName: string;
  assignedStaffId: string | null; // denormalized from the lead at creation time, for read-rule scoping
  origin: WhatsAppMessageOrigin;
  automationId: string | null; // null for manual sends
  automationName: string | null; // denormalized so history/logs don't need a join after an automation is edited/deleted
  trigger: WhatsAppAutomationTrigger | "manual";
  templateId: string | null;
  templateName: string | null;
  toPhone: string; // normalized E.164-ish value at send time
  renderedMessage: string;
  variablesUsed: Record<string, string>;
  provider: WhatsAppProviderName;
  providerMessageId: string | null; // set once a real provider is connected
  status: WhatsAppMessageStatus;
  error: string | null;
  idempotencyKey: string; // also used as the Firestore document id
  scheduledFor: Timestamp | null;
  processedAt: Timestamp | null;
  createdByStaffId: string | null; // null for script-originated (periodic processor) messages
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface WhatsAppMessageEventDoc {
  id: string;
  status: WhatsAppMessageStatus;
  note: string | null;
  at: Timestamp | null;
}

export interface WhatsAppSettingsDoc {
  schoolName: string;
  schoolPhone: string;
  schoolAddress: string;
  // Future-provider placeholders — deliberately never populated by this build.
  // See web/src/lib/whatsapp/provider.ts: the active provider is chosen by
  // config (VITE_WHATSAPP_PROVIDER), not by anything stored here.
  futureProvider: "meta" | null;
  futurePhoneNumberId: string | null;
  futureBusinessAccountId: string | null;
  // Never store an access token in Firestore — this field only exists so the
  // Settings UI has somewhere to show "not configured" once a provider is
  // wired up; the real token always lives in a server-side secret.
  updatedAt: Timestamp | null;
}

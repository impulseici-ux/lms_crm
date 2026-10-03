import { Timestamp } from "firebase/firestore";
import { isValidLeadPhone } from "@/utils/phone";
import { renderTemplate } from "@/lib/whatsapp/templates";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import {
  createWhatsAppMessageIfAbsent,
  getWhatsAppMessage,
  setWhatsAppMessageRendered,
  setWhatsAppMessageStatus,
} from "@/lib/data/whatsapp";
import { addActivity } from "@/lib/data/activities";
import type {
  AutomationLeadContext,
  WhatsAppAutomationDoc,
  WhatsAppAutomationTrigger,
  WhatsAppMessageOrigin,
  WhatsAppTemplateDoc,
} from "@/types/whatsapp";

// ---------------------------------------------------------------------------
// The automation engine — the only thing in the CRM that's allowed to create
// or advance a whatsappMessages record. Everything upstream (trigger hooks,
// the manual Send WhatsApp button, the periodic processor script) builds the
// inputs; everything downstream (the UI) only ever reads. See Section 11.
// ---------------------------------------------------------------------------

/** Sanitizes a free-form key segment into something safe to join into a Firestore document id. */
function keySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);
}

/** The deterministic id/idempotency-key for one (lead, automation-or-manual, event) occurrence — Section 12. */
export function buildIdempotencyKey(leadId: string, automationId: string | null, eventKey: string): string {
  return [keySegment(leadId), keySegment(automationId ?? "manual"), keySegment(eventKey)].join("__");
}

export interface QueueMessageInput {
  lead: AutomationLeadContext;
  automation: WhatsAppAutomationDoc | null;
  template: WhatsAppTemplateDoc;
  trigger: WhatsAppAutomationTrigger | "manual";
  eventKey: string;
  origin: WhatsAppMessageOrigin;
  createdByStaffId: string | null;
  scheduledFor?: Date | null;
  variableContext: Partial<Record<string, string>>;
  /** Who to attribute the resulting lead-timeline activity entry to. Pass the acting staff's uid for a browser-triggered action, or a "system:…" label for script-originated ones. Pass null to skip logging an activity at all. */
  logActivityAs: string | null;
}

export type QueueOutcome =
  | { status: "duplicate"; messageId: string }
  | { status: "blocked"; messageId: string; reason: string }
  | { status: "scheduled"; messageId: string }
  | { status: "simulated"; messageId: string }
  | { status: "sent"; messageId: string }
  | { status: "failed"; messageId: string; reason: string };

/** Queues (and, unless scheduled for later, immediately processes) one WhatsApp message. Safe to call repeatedly for the same logical event — Section 12. */
export async function queueWhatsAppMessage(input: QueueMessageInput): Promise<QueueOutcome> {
  const idempotencyKey = buildIdempotencyKey(input.lead.id, input.automation?.id ?? null, input.eventKey);
  const scheduledFor = input.scheduledFor ? Timestamp.fromDate(input.scheduledFor) : null;
  const isScheduledForLater = !!scheduledFor && scheduledFor.toMillis() > Date.now();

  const { created, id } = await createWhatsAppMessageIfAbsent(idempotencyKey, {
    leadId: input.lead.id,
    leadChildName: input.lead.childName,
    leadParentName: input.lead.parentName,
    assignedStaffId: input.lead.assignedStaffId,
    origin: input.origin,
    automationId: input.automation?.id ?? null,
    automationName: input.automation?.name ?? null,
    trigger: input.trigger,
    templateId: input.template.id,
    templateName: input.template.name,
    toPhone: input.lead.parentPhone,
    renderedMessage: "",
    variablesUsed: input.variableContext as Record<string, string>,
    provider: getWhatsAppProvider().name,
    providerMessageId: null,
    status: "DRAFT",
    error: null,
    scheduledFor,
    processedAt: null,
    createdByStaffId: input.createdByStaffId,
  });

  if (!created) return { status: "duplicate", messageId: id };

  // Guardrails — Sections 22/23/6. A blocked message still exists (for the logs), it's
  // just immediately terminal with a reason, never silently dropped and never sent.
  if (!isValidLeadPhone(input.lead.parentPhone)) {
    await setWhatsAppMessageStatus(id, "CANCELLED", { error: "Invalid or missing mobile number." });
    return { status: "blocked", messageId: id, reason: "Invalid or missing mobile number." };
  }
  // Opt-out blocks AUTOMATED messages only (Section 23). A manual send is a staff
  // member's own deliberate, informed action — the UI surfaces the opt-out status so
  // they can decide, rather than the engine silently refusing it for them.
  if (input.origin === "automated" && input.lead.whatsappOptStatus === "Opted Out") {
    await setWhatsAppMessageStatus(id, "CANCELLED", { error: "Lead has opted out of WhatsApp messaging." });
    return { status: "blocked", messageId: id, reason: "Lead has opted out of WhatsApp messaging." };
  }
  const render = renderTemplate(input.template.content, input.variableContext);
  if (!render.ok) {
    const reason = `Missing data for: ${render.missing.join(", ")}`;
    await setWhatsAppMessageStatus(id, "CANCELLED", { error: reason });
    return { status: "blocked", messageId: id, reason };
  }

  await setWhatsAppMessageRendered(id, render.rendered!);

  if (isScheduledForLater) {
    await setWhatsAppMessageStatus(id, "PENDING_PROVIDER");
    return { status: "scheduled", messageId: id };
  }

  return processQueuedMessage(id, input.logActivityAs);
}

/** Advances one already-created message through the provider. Used both for immediate sends and by the periodic processor for due scheduled/queued messages. */
export async function processQueuedMessage(messageId: string, logActivityAs: string | null): Promise<QueueOutcome> {
  const message = await getWhatsAppMessage(messageId);
  if (!message) return { status: "failed", messageId, reason: "Message record not found." };
  if (["SIMULATED", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED", "MANUAL_OPENED"].includes(message.status)) {
    return message.status === "FAILED" || message.status === "CANCELLED"
      ? { status: "blocked", messageId, reason: message.error ?? "Already terminal." }
      : { status: "simulated", messageId };
  }

  await setWhatsAppMessageStatus(messageId, "QUEUED");
  await setWhatsAppMessageStatus(messageId, "PROCESSING");

  const provider = getWhatsAppProvider();
  const result = await provider.sendTemplateMessage(message.toPhone, message.templateName ?? "manual", message.renderedMessage, message.variablesUsed);

  if (!result.ok) {
    await setWhatsAppMessageStatus(messageId, "FAILED", { error: result.error ?? "Provider error." });
    return { status: "failed", messageId, reason: result.error ?? "Provider error." };
  }

  const finalStatus = result.status === "simulated" ? "SIMULATED" : "SENT";
  await setWhatsAppMessageStatus(messageId, finalStatus, { providerMessageId: result.providerMessageId });

  if (logActivityAs) {
    const label = message.origin === "automated" ? "Automated WhatsApp" : "Manual WhatsApp";
    const statusLabel = finalStatus === "SIMULATED" ? "simulated (Development Mode — not actually sent)" : finalStatus.toLowerCase();
    await addActivity(message.leadId, logActivityAs, {
      type: "whatsapp_logged",
      text: `${label} — ${message.templateName ?? "message"} — ${statusLabel}`,
    }).catch(() => {
      // Best-effort: a missing activity-log entry must never fail the message send itself.
    });
  }

  return { status: finalStatus === "SIMULATED" ? "simulated" : "sent", messageId };
}

export interface ManualSendInput {
  lead: AutomationLeadContext;
  template: WhatsAppTemplateDoc;
  variableContext: Partial<Record<string, string>>;
  staffId: string;
}

/** "Simulate Send" on a lead's WhatsApp panel (Section 8) — a manual, one-off send; each click is its own event, never deduped against a prior one. */
export function sendManualWhatsAppMessage(input: ManualSendInput): Promise<QueueOutcome> {
  return queueWhatsAppMessage({
    lead: input.lead,
    automation: null,
    template: input.template,
    trigger: "manual",
    eventKey: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    origin: "manual",
    createdByStaffId: input.staffId,
    scheduledFor: null,
    variableContext: input.variableContext,
    logActivityAs: input.staffId,
  });
}

/**
 * "Open WhatsApp" (Section 9) — opens the click-to-chat link manually; a human still
 * has to press Send themselves, so this is never allowed to progress past MANUAL_OPENED.
 * Records the attempt for history/audit without ever claiming it was delivered or sent.
 */
export async function recordManualWhatsAppOpen(input: ManualSendInput): Promise<{ messageId: string } | null> {
  const render = renderTemplate(input.template.content, input.variableContext);
  if (!render.ok) return null; // the UI already checked this before offering the button — defensive only

  const idempotencyKey = buildIdempotencyKey(input.lead.id, null, `manual-open:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);
  const { id } = await createWhatsAppMessageIfAbsent(idempotencyKey, {
    leadId: input.lead.id,
    leadChildName: input.lead.childName,
    leadParentName: input.lead.parentName,
    assignedStaffId: input.lead.assignedStaffId,
    origin: "manual",
    automationId: null,
    automationName: null,
    trigger: "manual",
    templateId: input.template.id,
    templateName: input.template.name,
    toPhone: input.lead.parentPhone,
    renderedMessage: render.rendered!,
    variablesUsed: input.variableContext as Record<string, string>,
    provider: getWhatsAppProvider().name,
    providerMessageId: null,
    status: "MANUAL_OPENED",
    error: null,
    scheduledFor: null,
    processedAt: Timestamp.now(),
    createdByStaffId: input.staffId,
  });

  await addActivity(input.lead.id, input.staffId, {
    type: "whatsapp_logged",
    text: `Opened WhatsApp manually — ${input.template.name} (not yet sent — a provider isn't connected).`,
  }).catch(() => {});

  return { messageId: id };
}

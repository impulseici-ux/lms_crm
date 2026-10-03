import { getDoc, getDocs, query, where } from "firebase/firestore";
import { whatsappAutomationsCol, whatsappTemplateDoc, programDoc, userDoc } from "@/lib/data/collections";
import { buildVariableContext } from "@/lib/whatsapp/templates";
import { queueWhatsAppMessage, type QueueOutcome } from "@/lib/whatsapp/engine";
import { getWhatsAppSettings } from "@/lib/data/whatsapp";
import type { LeadStatus } from "@/types";
import type {
  AutomationLeadContext,
  WhatsAppAutomationDoc,
  WhatsAppAutomationTrigger,
  WhatsAppTemplateDoc,
} from "@/types/whatsapp";

// ---------------------------------------------------------------------------
// The single entry point every real-time CRM action calls after a successful
// write — Section 5/16. Looks up matching active automations, resolves
// template variables from the lead, and hands each one to the engine. Always
// best-effort: an automation problem must never surface as a failure of the
// CRM action that triggered it (creating a lead, changing its status, …).
// ---------------------------------------------------------------------------

export interface RunAutomationsOptions {
  /** What makes THIS occurrence of the trigger unique for idempotency — e.g. "created", a status name, an ISO date. Section 12. */
  eventKey: string;
  /** The staff member who performed the action that caused this trigger, for the resulting activity-log entry. */
  actingStaffId: string;
  /** Only run automations whose condition.fromStatus/toStatus match (for lead_stage_changed); omit for triggers without a stage condition. */
  fromStatus?: LeadStatus;
  toStatus?: LeadStatus;
  /** Fire a specific scheduled time (e.g. a visit reminder the day before) instead of immediately, offset by the automation's own delayMinutes. */
  scheduledFor?: Date | null;
}

async function resolveTemplate(templateId: string): Promise<WhatsAppTemplateDoc | null> {
  const snap = await getDoc(whatsappTemplateDoc(templateId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<WhatsAppTemplateDoc, "id">) }) : null;
}

async function resolveProgramName(programId: string | null): Promise<string | null> {
  if (!programId) return null;
  const snap = await getDoc(programDoc(programId));
  return snap.exists() ? ((snap.data().name as string) ?? null) : null;
}

async function resolveStaffName(staffId: string | null): Promise<string | null> {
  if (!staffId) return null;
  const snap = await getDoc(userDoc(staffId));
  return snap.exists() ? ((snap.data().displayName as string) ?? null) : null;
}

function matchesCondition(automation: WhatsAppAutomationDoc, opts: RunAutomationsOptions): boolean {
  const c = automation.condition ?? {};
  if (automation.trigger === "lead_stage_changed") {
    if (c.fromStatus && c.fromStatus !== opts.fromStatus) return false;
    if (c.toStatus && c.toStatus !== opts.toStatus) return false;
  }
  return true;
}

/** Finds active automations for a trigger, renders each one's template for this lead, and queues it. Never throws — automation failures are logged to the console, not surfaced to the caller. */
export async function runAutomationsForEvent(
  trigger: WhatsAppAutomationTrigger,
  lead: AutomationLeadContext,
  opts: RunAutomationsOptions
): Promise<QueueOutcome[]> {
  try {
    const snap = await getDocs(query(whatsappAutomationsCol(), where("trigger", "==", trigger), where("active", "==", true)));
    const automations = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhatsAppAutomationDoc, "id">) }));
    const matching = automations.filter((a) => matchesCondition(a, opts));
    if (matching.length === 0) return [];

    const [programName, staffName, settings] = await Promise.all([
      resolveProgramName(lead.interestedProgramId),
      resolveStaffName(lead.assignedStaffId),
      getWhatsAppSettings(),
    ]);

    const context = buildVariableContext({
      parentName: lead.parentName,
      childName: lead.childName,
      mobile: lead.parentPhone,
      programName,
      stage: lead.status,
      sourceChannel: lead.sourceChannel,
      visitDate: lead.visitDate,
      staffName,
      nextFollowUpAt: lead.nextFollowUpAt,
      schoolName: settings.schoolName,
      schoolPhone: settings.schoolPhone,
      schoolAddress: settings.schoolAddress,
    });

    const outcomes: QueueOutcome[] = [];
    for (const automation of matching) {
      const template = await resolveTemplate(automation.templateId);
      if (!template || !template.active) continue;

      const reminderDays = automation.trigger === "visit_scheduled" ? automation.condition?.reminderDaysBeforeVisit : null;
      const delayMs = Math.max(0, automation.delayMinutes) * 60_000;
      let scheduledFor: Date | null = opts.scheduledFor ?? null;
      if (!scheduledFor && reminderDays && lead.visitDate) {
        const reminderAt = lead.visitDate.toDate();
        reminderAt.setDate(reminderAt.getDate() - reminderDays);
        reminderAt.setHours(10, 0, 0, 0);
        scheduledFor = reminderAt;
      } else if (!scheduledFor && delayMs > 0) {
        scheduledFor = new Date(Date.now() + delayMs);
      }

      const outcome = await queueWhatsAppMessage({
        lead,
        automation,
        template,
        trigger,
        eventKey: opts.eventKey,
        origin: "automated",
        createdByStaffId: opts.actingStaffId,
        scheduledFor,
        variableContext: context,
        logActivityAs: opts.actingStaffId,
      });
      outcomes.push(outcome);
    }
    return outcomes;
  } catch (err) {
    // Best-effort by design — see file header.
    console.error(`WhatsApp automation for "${trigger}" failed:`, err);
    return [];
  }
}

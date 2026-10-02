import type { Timestamp } from "firebase/firestore";
import { WHATSAPP_TEMPLATE_VARIABLES, type WhatsAppTemplateVariable } from "@/types/whatsapp";

const TOKEN_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Every `{{token}}` referenced in a template's content, in first-seen order, deduped. */
export function extractTemplateTokens(content: string): string[] {
  const seen = new Set<string>();
  for (const match of content.matchAll(TOKEN_RE)) seen.add(match[1]);
  return Array.from(seen);
}

/** Tokens a template references that aren't in the supported variable list at all — a template-authoring error, caught at save time. */
export function unsupportedTemplateTokens(content: string): string[] {
  const supported = new Set<string>(WHATSAPP_TEMPLATE_VARIABLES);
  return extractTemplateTokens(content).filter((t) => !supported.has(t));
}

function formatDate(ts: Timestamp | null | undefined): string | undefined {
  return ts ? ts.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : undefined;
}
function formatTime(ts: Timestamp | null | undefined): string | undefined {
  return ts ? ts.toDate().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : undefined;
}

export interface VariableContextInput {
  parentName: string;
  childName: string;
  mobile: string;
  programName: string | null; // resolved display name, not the id
  stage: string;
  sourceChannel: string;
  visitDate: Timestamp | null;
  staffName: string | null; // resolved display name, not the id — null when unassigned
  nextFollowUpAt: Timestamp | null;
  schoolName: string;
  schoolPhone: string;
  schoolAddress: string;
}

/**
 * Builds the variable → value map for one lead. A variable is only present in the
 * returned record when the CRM actually has that data for this lead right now — e.g.
 * visit_date is absent (not "") when no visit has been recorded yet. renderTemplate
 * then treats any token a template references that isn't in this record as "missing"
 * and blocks the send, rather than silently sending a blank.
 */
export function buildVariableContext(input: VariableContextInput): Partial<Record<WhatsAppTemplateVariable, string>> {
  const visitDate = formatDate(input.visitDate);
  const visitTime = formatTime(input.visitDate);
  const followupDate = formatDate(input.nextFollowUpAt);
  const followupTime = formatTime(input.nextFollowUpAt);

  const ctx: Partial<Record<WhatsAppTemplateVariable, string>> = {
    parent_name: input.parentName || undefined,
    child_name: input.childName || undefined,
    mobile: input.mobile || undefined,
    course: input.programName ?? undefined,
    stage: input.stage || undefined,
    lead_source: input.sourceChannel || undefined,
    visit_date: visitDate,
    visit_time: visitTime,
    staff_name: input.staffName ?? undefined,
    followup_date: followupDate,
    followup_time: followupTime,
    school_name: input.schoolName || undefined,
    school_phone: input.schoolPhone || undefined,
    school_address: input.schoolAddress || undefined,
  };
  // Strip undefined keys so `key in ctx` / direct lookups behave as "absent", not "present but undefined".
  for (const k of Object.keys(ctx) as WhatsAppTemplateVariable[]) {
    if (ctx[k] === undefined) delete ctx[k];
  }
  return ctx;
}

export interface RenderResult {
  ok: boolean;
  rendered: string | null;
  missing: string[];
}

/** Substitutes every {{token}} in content using context. Blocks (ok:false) if ANY referenced token has no value, rather than sending a message with a blank gap in it. */
export function renderTemplate(content: string, context: Partial<Record<string, string>>): RenderResult {
  const missing = extractTemplateTokens(content).filter((t) => context[t] == null || context[t] === "");
  if (missing.length > 0) return { ok: false, rendered: null, missing };
  const rendered = content.replace(TOKEN_RE, (_match, token: string) => context[token] ?? "");
  return { ok: true, rendered, missing: [] };
}

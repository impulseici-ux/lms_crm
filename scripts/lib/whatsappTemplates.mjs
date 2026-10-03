// Mirrors web/src/lib/whatsapp/templates.ts — kept as a separate copy since this
// script runs as plain Node (Admin SDK), not bundled with the Vite/TS frontend.
// Any change here should be mirrored there, and vice versa.

const TOKEN_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

export function extractTemplateTokens(content) {
  const seen = new Set();
  for (const match of content.matchAll(TOKEN_RE)) seen.add(match[1]);
  return Array.from(seen);
}

function formatDate(date) {
  return date ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : undefined;
}
function formatTime(date) {
  return date ? date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : undefined;
}

/** Same shape/behavior as the TS version's buildVariableContext — see that file for the "why" on each field. */
export function buildVariableContext(input) {
  const ctx = {
    parent_name: input.parentName || undefined,
    child_name: input.childName || undefined,
    mobile: input.mobile || undefined,
    course: input.programName ?? undefined,
    stage: input.stage || undefined,
    lead_source: input.sourceChannel || undefined,
    visit_date: formatDate(input.visitDate),
    visit_time: formatTime(input.visitDate),
    staff_name: input.staffName ?? undefined,
    followup_date: formatDate(input.nextFollowUpAt),
    followup_time: formatTime(input.nextFollowUpAt),
    school_name: input.schoolName || undefined,
    school_phone: input.schoolPhone || undefined,
    school_address: input.schoolAddress || undefined,
  };
  for (const k of Object.keys(ctx)) {
    if (ctx[k] === undefined) delete ctx[k];
  }
  return ctx;
}

/** Blocks (ok:false) if ANY referenced token has no value, rather than sending a message with a blank gap in it. */
export function renderTemplate(content, context) {
  const missing = extractTemplateTokens(content).filter((t) => context[t] == null || context[t] === "");
  if (missing.length > 0) return { ok: false, rendered: null, missing };
  const rendered = content.replace(TOKEN_RE, (_match, token) => context[token] ?? "");
  return { ok: true, rendered, missing: [] };
}

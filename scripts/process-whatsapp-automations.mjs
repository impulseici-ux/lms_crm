// Periodic WhatsApp automation processor — runs via GitHub Actions (see
// .github/workflows/whatsapp-automations.yml), the same pattern as
// sync-google-sheets-leads.mjs. Runs on the free Spark plan: this is a plain
// script, not a Cloud Function, so no Blaze upgrade is required.
//
// Handles everything a real-time browser trigger structurally can't:
//   1. Leads created by the Google Sheets → Meta Ads sync (which writes via the
//      Admin SDK directly and never runs any browser code) still need their
//      "New Lead Created" automation — this is the catch-up pass for that.
//   2. Follow-up Due / Follow-up Overdue are derived from the current time, not
//      a discrete write, so they can only ever be driven by a periodic scan.
//   3. Scheduled messages (Section 13 — e.g. a visit reminder queued for the
//      day before) become due here, not at creation time.
//
// Every message this script creates goes through the exact same
// createMessageIfAbsent (deterministic-id) idempotency as the browser engine
// (web/src/lib/whatsapp/engine.ts) — Section 12. Running this script
// repeatedly, or overlapping with a browser-side trigger for the same event,
// is always safe: whichever one creates the record first wins, the other is a
// silent no-op.
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { normalizeLeadPhone, isValidLeadPhone } from "./lib/phone.mjs";
import { buildVariableContext, renderTemplate } from "./lib/whatsappTemplates.mjs";

function parseServiceAccountJson(envVarName) {
  const raw = process.env[envVarName];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${envVarName} is not valid JSON.`);
  }
}

function initFirebaseAdmin() {
  // Local emulator testing (matches scripts/seed.mjs) — never set in the GitHub
  // Actions workflow, so production always goes through a real credential below.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || "lms-crm-dev" });
    return;
  }
  const inlineKey = parseServiceAccountJson("FIREBASE_SERVICE_ACCOUNT_KEY");
  if (inlineKey) {
    initializeApp({ credential: cert(inlineKey) });
    return;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault() });
    return;
  }
  throw new Error("Set FIREBASE_SERVICE_ACCOUNT_KEY (inline JSON) or GOOGLE_APPLICATION_CREDENTIALS (file path) for the Firebase Admin SDK.");
}

initFirebaseAdmin();
const db = getFirestore();

const OPEN_STATUSES = ["New Lead", "Contacted", "Interested", "Visit Scheduled", "Visit Completed", "Admission Discussion", "Admission Confirmed"];
const TERMINAL_STATUSES = ["SIMULATED", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED", "MANUAL_OPENED"];
const NEW_LEAD_LOOKBACK_HOURS = 72;

const now = new Date();
const stats = { newLeadsScanned: 0, followUpsScanned: 0, scheduledProcessed: 0, queued: 0, blocked: 0, simulated: 0, failed: 0 };

function keySegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);
}
function buildIdempotencyKey(leadId, automationId, eventKey) {
  return [keySegment(leadId), keySegment(automationId ?? "manual"), keySegment(eventKey)].join("__");
}

const templateCache = new Map();
async function loadTemplate(id) {
  if (templateCache.has(id)) return templateCache.get(id);
  const snap = await db.collection("whatsappTemplates").doc(id).get();
  const template = snap.exists ? { id: snap.id, ...snap.data() } : null;
  templateCache.set(id, template);
  return template;
}

async function loadActiveAutomationsByTrigger(trigger) {
  const snap = await db.collection("whatsappAutomations").where("trigger", "==", trigger).where("active", "==", true).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

let settingsCache = null;
async function loadSettings() {
  if (settingsCache) return settingsCache;
  const snap = await db.collection("whatsappSettings").doc("config").get();
  settingsCache = snap.exists ? snap.data() : { schoolName: "Little Millennium Singanallur", schoolPhone: "", schoolAddress: "" };
  return settingsCache;
}

const programNameCache = new Map();
async function resolveProgramName(id) {
  if (!id) return null;
  if (programNameCache.has(id)) return programNameCache.get(id);
  const snap = await db.collection("programs").doc(id).get();
  const name = snap.exists ? (snap.data().name ?? null) : null;
  programNameCache.set(id, name);
  return name;
}
const staffNameCache = new Map();
async function resolveStaffName(id) {
  if (!id) return null;
  if (staffNameCache.has(id)) return staffNameCache.get(id);
  const snap = await db.collection("users").doc(id).get();
  const name = snap.exists ? (snap.data().displayName ?? null) : null;
  staffNameCache.set(id, name);
  return name;
}

async function createMessageIfAbsent(idempotencyKey, data) {
  const ref = db.collection("whatsappMessages").doc(idempotencyKey);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return { created: false, id: ref.id };
    tx.set(ref, { ...data, idempotencyKey, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { created: true, id: ref.id };
  });
}

async function setMessageStatus(id, status, extra = {}) {
  await db.collection("whatsappMessages").doc(id).update({
    status,
    error: extra.error ?? null,
    ...(extra.providerMessageId !== undefined ? { providerMessageId: extra.providerMessageId } : {}),
    ...(extra.processedAt === "now" ? { processedAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("whatsappMessages").doc(id).collection("events").add({ status, note: extra.error ?? null, at: FieldValue.serverTimestamp() });
}

/** Mirrors engine.ts's processQueuedMessage — the Development provider never makes a network call and always reports SIMULATED. */
async function processMessage(id) {
  const snap = await db.collection("whatsappMessages").doc(id).get();
  if (!snap.exists) return;
  const message = snap.data();
  if (TERMINAL_STATUSES.includes(message.status)) return;

  await setMessageStatus(id, "QUEUED");
  await setMessageStatus(id, "PROCESSING");
  await setMessageStatus(id, "SIMULATED", { processedAt: "now" });
  stats.simulated++;

  await db
    .collection("leads")
    .doc(message.leadId)
    .collection("activities")
    .add({
      type: "whatsapp_logged",
      byStaffId: "system:whatsapp-automation",
      at: FieldValue.serverTimestamp(),
      text: `Automated WhatsApp — ${message.templateName ?? "message"} — simulated (Development Mode — not actually sent).`,
    })
    .catch(() => {
      // Best-effort — a missing activity entry must never fail the message itself.
    });
}

/** Mirrors engine.ts's queueWhatsAppMessage. */
async function queueMessage({ lead, automation, template, trigger, eventKey }) {
  const settings = await loadSettings();
  const idempotencyKey = buildIdempotencyKey(lead.id, automation.id, eventKey);
  const { created, id } = await createMessageIfAbsent(idempotencyKey, {
    leadId: lead.id,
    leadChildName: lead.childName,
    leadParentName: lead.parentName,
    assignedStaffId: lead.assignedStaffId ?? null,
    origin: "automated",
    automationId: automation.id,
    automationName: automation.name,
    trigger,
    templateId: template.id,
    templateName: template.name,
    toPhone: lead.parentPhone,
    renderedMessage: "",
    variablesUsed: {},
    provider: "development",
    providerMessageId: null,
    status: "DRAFT",
    error: null,
    scheduledFor: null,
    processedAt: null,
    createdByStaffId: null,
  });
  if (!created) return "duplicate";

  const normalizedPhone = normalizeLeadPhone(lead.parentPhone).value;
  if (!isValidLeadPhone(normalizedPhone)) {
    await setMessageStatus(id, "CANCELLED", { error: "Invalid or missing mobile number." });
    stats.blocked++;
    return "blocked";
  }
  if (lead.whatsappOptStatus === "Opted Out") {
    await setMessageStatus(id, "CANCELLED", { error: "Lead has opted out of WhatsApp messaging." });
    stats.blocked++;
    return "blocked";
  }

  const context = buildVariableContext({
    parentName: lead.parentName,
    childName: lead.childName,
    mobile: lead.parentPhone,
    programName: await resolveProgramName(lead.interestedProgramId ?? null),
    stage: lead.status,
    sourceChannel: lead.sourceChannel,
    visitDate: lead.visitDate ? lead.visitDate.toDate() : null,
    staffName: await resolveStaffName(lead.assignedStaffId ?? null),
    nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.toDate() : null,
    schoolName: settings.schoolName,
    schoolPhone: settings.schoolPhone,
    schoolAddress: settings.schoolAddress,
  });
  const render = renderTemplate(template.content, context);
  if (!render.ok) {
    await setMessageStatus(id, "CANCELLED", { error: `Missing data for: ${render.missing.join(", ")}` });
    stats.blocked++;
    return "blocked";
  }

  await db.collection("whatsappMessages").doc(id).update({ renderedMessage: render.rendered, variablesUsed: context, updatedAt: FieldValue.serverTimestamp() });
  await processMessage(id);
  stats.queued++;
  return "queued";
}

async function scanNewLeads() {
  const automations = await loadActiveAutomationsByTrigger("new_lead_created");
  if (automations.length === 0) return;

  const lookback = Timestamp.fromMillis(Date.now() - NEW_LEAD_LOOKBACK_HOURS * 3600 * 1000);
  const snap = await db.collection("leads").where("createdAt", ">=", lookback).get();
  stats.newLeadsScanned = snap.size;

  for (const doc of snap.docs) {
    const lead = { id: doc.id, ...doc.data() };
    for (const automation of automations) {
      const template = await loadTemplate(automation.templateId);
      if (!template || !template.active) continue;
      await queueMessage({ lead, automation, template, trigger: "new_lead_created", eventKey: "created" });
    }
  }
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function scanFollowUps() {
  const [dueAutomations, overdueAutomations] = await Promise.all([
    loadActiveAutomationsByTrigger("follow_up_due"),
    loadActiveAutomationsByTrigger("follow_up_overdue"),
  ]);
  if (dueAutomations.length === 0 && overdueAutomations.length === 0) return;

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const snap = await db.collection("leads").where("nextFollowUpAt", "<=", Timestamp.fromDate(endOfToday)).get();
  stats.followUpsScanned = snap.size;

  for (const doc of snap.docs) {
    const lead = { id: doc.id, ...doc.data() };
    if (!OPEN_STATUSES.includes(lead.status)) continue; // a closed lead doesn't need a follow-up reminder
    if (!lead.nextFollowUpAt) continue;

    const due = lead.nextFollowUpAt.toDate();
    const sameDay = isSameDay(due, now);
    const overdue = due.getTime() < now.getTime() && !sameDay;
    if (!overdue && !sameDay) continue;

    const automations = overdue ? overdueAutomations : dueAutomations;
    const trigger = overdue ? "follow_up_overdue" : "follow_up_due";
    // Keyed on the follow-up's own due timestamp so rescheduling it is a fresh event
    // (a new reminder), while re-scanning the same unchanged due date is a duplicate.
    const eventKey = `followup:${due.toISOString()}`;
    for (const automation of automations) {
      const template = await loadTemplate(automation.templateId);
      if (!template || !template.active) continue;
      await queueMessage({ lead, automation, template, trigger, eventKey });
    }
  }
}

async function processDueScheduledMessages() {
  const snap = await db
    .collection("whatsappMessages")
    .where("status", "==", "PENDING_PROVIDER")
    .where("scheduledFor", "<=", Timestamp.now())
    .get();
  stats.scheduledProcessed = snap.size;
  for (const doc of snap.docs) await processMessage(doc.id);
}

async function main() {
  await scanNewLeads();
  await scanFollowUps();
  await processDueScheduledMessages();
  console.log("WhatsApp automation processor run complete:", JSON.stringify(stats));
  process.exit(0);
}

main().catch((err) => {
  console.error("WhatsApp automation processor failed:", err);
  process.exit(1);
});

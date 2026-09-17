// Google Sheets (Meta Ads) → CRM lead sync.
//
// Reads new rows from a Google Sheet fed by a Meta Lead Ads integration and
// creates matching documents in the same `leads` collection every other lead
// path (manual form, CSV import) writes to — no parallel lead system.
//
// Idempotent: every row is keyed by an "external lead id" (the Meta Lead ID
// column if present, else a hash of phone+email+created-time). Each key gets
// exactly one claim in the `metaLeadSyncLedger` collection; re-running this
// script (or running it concurrently) can never create a duplicate lead.
// Rows that fail (bad phone, unmapped columns, transient Firestore error)
// are logged with a reason and retried automatically on the next run,
// without blocking any other row.
//
// Runs on the free Spark plan — this is a plain Node script using the
// Firebase Admin SDK directly (same pattern as scripts/set-role.mjs and
// scripts/seed.mjs), not a Cloud Function, so no Blaze upgrade is required.
// Automatic scheduling is handled by .github/workflows/sync-leads.yml.
//
// Required env vars — see README.md "Google Sheets lead sync" section:
//   GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY   JSON key (as a string) for a Google
//                                       service account with Sheets API read
//                                       access, shared as Viewer on the sheet.
//   GOOGLE_SHEETS_SPREADSHEET_ID        Target spreadsheet ID.
//   GOOGLE_SHEETS_SHEET_NAME            Tab name, e.g. "Sheet1".
//   FIREBASE_SERVICE_ACCOUNT_KEY        JSON key (as a string) for the
//                                       Firebase Admin SDK. Falls back to
//                                       GOOGLE_APPLICATION_CREDENTIALS (a file
//                                       path) for local runs.
//
// Usage:
//   node scripts/sync-google-sheets-leads.mjs
import { createHash } from "node:crypto";
import { JWT } from "google-auth-library";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { resolveHeader } from "./lib/sheetFieldMapping.mjs";

const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const FOLLOW_UP_DEFAULT_HOURS = 24;
const OPEN_STATUS = "New Lead";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

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
  const inlineKey = parseServiceAccountJson("FIREBASE_SERVICE_ACCOUNT_KEY");
  if (inlineKey) {
    initializeApp({ credential: cert(inlineKey) });
    return;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault() });
    return;
  }
  throw new Error(
    "Set FIREBASE_SERVICE_ACCOUNT_KEY (inline JSON) or GOOGLE_APPLICATION_CREDENTIALS (file path) for the Firebase Admin SDK."
  );
}

async function getSheetsAccessToken() {
  const key = parseServiceAccountJson("GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY");
  if (!key) throw new Error("Missing GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY (inline JSON for a Google service account).");
  const jwt = new JWT({ email: key.client_email, key: key.private_key, scopes: [SHEETS_READONLY_SCOPE] });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error("Could not obtain a Google Sheets access token — check the service account key.");
  return token;
}

async function fetchSheetRows(spreadsheetId, sheetName, accessToken) {
  const range = encodeURIComponent(`'${sheetName}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets API request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.values ?? [];
}

export function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
}

function isValidEmail(value) {
  if (!value) return true; // email is optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function computeExternalLeadId(fields) {
  if (fields.externalLeadId) return `meta:${fields.externalLeadId}`;
  const basis = `${normalizePhone(fields.parentPhone)}|${(fields.parentEmail ?? "").toLowerCase()}|${fields.createdTime ?? ""}`;
  return `hash:${createHash("sha256").update(basis).digest("hex").slice(0, 32)}`;
}

/** Parse one raw sheet row (array of cells) into a field map using the header→field mapping. */
export function mapRow(headerFields, cells) {
  const fields = {};
  headerFields.forEach((field, idx) => {
    if (!field) return;
    const value = (cells[idx] ?? "").toString().trim();
    if (value) fields[field] = value;
  });
  return fields;
}

export function validateRow(fields) {
  if (!fields.parentPhone || normalizePhone(fields.parentPhone).length < 7) {
    return "Missing or invalid phone number.";
  }
  if (!isValidEmail(fields.parentEmail)) {
    return "Invalid email address.";
  }
  if (!fields.parentName) {
    return "Missing lead name.";
  }
  return null;
}

async function findCampaignIdByName(db, name) {
  if (!name) return null;
  const snap = await db.collection("campaigns").where("name", "==", name).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * The idempotent core: given already-fetched header/data rows, claims each
 * row's external-lead-id in the dedupe ledger and creates the lead on first
 * claim only. Exported separately from Sheets-fetching/auth so it can be
 * exercised directly against a real Firestore instance in tests.
 */
export async function processDataRows(db, { headerFields, dataRows, columnOverrides: _columnOverrides }) {
  let imported = 0;
  let duplicates = 0;
  let failed = 0;
  const failedRows = [];
  const campaignCache = new Map();

  for (let i = 0; i < dataRows.length; i++) {
    const sheetRow = i + 2; // +1 for 0-index, +1 for the header row
    const cells = dataRows[i];
    if (cells.every((c) => !String(c ?? "").trim())) continue; // fully blank row

    const fields = mapRow(headerFields, cells);
    const externalLeadId = computeExternalLeadId(fields);
    const ledgerRef = db.collection("metaLeadSyncLedger").doc(externalLeadId);

    try {
      const validationError = validateRow(fields);
      if (validationError) throw new Error(validationError);

      let campaignId = null;
      if (fields.campaignName) {
        if (campaignCache.has(fields.campaignName)) {
          campaignId = campaignCache.get(fields.campaignName);
        } else {
          campaignId = await findCampaignIdByName(db, fields.campaignName);
          campaignCache.set(fields.campaignName, campaignId);
        }
      }

      const outcome = await db.runTransaction(async (tx) => {
        const ledgerSnap = await tx.get(ledgerRef);
        if (ledgerSnap.exists && ledgerSnap.data().status === "synced") {
          return "duplicate";
        }

        const now = FieldValue.serverTimestamp();
        const nextFollowUpAt = new Date(Date.now() + FOLLOW_UP_DEFAULT_HOURS * 60 * 60 * 1000);
        const leadRef = db.collection("leads").doc();

        tx.set(leadRef, {
          parentName: fields.parentName,
          parentPhone: fields.parentPhone,
          parentEmail: fields.parentEmail ?? null,
          childName: fields.childName ?? fields.parentName,
          childAge: fields.childAge ?? null,
          childDob: null,
          interestedProgramId: null,
          branchId: null,
          location: fields.location ?? null,
          fees: null,
          sourceChannel: "Meta Ads",
          campaignId,
          utm: {
            source: fields.platform ?? "meta",
            medium: "paid_social",
            campaign: fields.campaignName ?? null,
          },
          referralName: null,
          howHeardOther: null,
          externalLeadId,
          metaAds: {
            formName: fields.formName ?? null,
            adSetName: fields.adSetName ?? null,
            adName: fields.adName ?? null,
            platform: fields.platform ?? null,
          },
          status: OPEN_STATUS,
          priority: "Medium",
          assignedStaffId: null,
          createdByStaffId: null,
          nextFollowUpAt,
          nextFollowUpType: "Call",
          lastContactedAt: null,
          lastActivityAt: now,
          visitDate: null,
          visitNotes: null,
          admissionNumber: null,
          admissionFeePlan: null,
          admissionConfirmedAt: null,
          householdId: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        });

        tx.set(leadRef.collection("activities").doc(), {
          type: "lead_created",
          byStaffId: "system:google-sheets-sync",
          at: now,
          text: "Lead captured via Meta Ads (synced from Google Sheet).",
        });

        tx.set(
          ledgerRef,
          {
            status: "synced",
            leadId: leadRef.id,
            sheetRow,
            reason: null,
            syncedAt: now,
            lastAttemptAt: now,
          },
          { merge: true }
        );

        return "synced";
      });

      if (outcome === "duplicate") {
        duplicates++;
      } else {
        imported++;
      }
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      failedRows.push({ row: sheetRow, reason });
      await ledgerRef
        .set(
          {
            status: "failed",
            reason,
            sheetRow,
            lastAttemptAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch((ledgerErr) => console.error(`Could not record failure for row ${sheetRow}:`, ledgerErr));
    }
  }

  return { imported, duplicates, failed, failedRows, rowsFound: dataRows.length };
}

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME ?? requireEnv("GOOGLE_SHEETS_SHEET_NAME");
  const triggeredBy = process.env.SYNC_TRIGGERED_BY === "manual" ? "manual" : "schedule";

  initFirebaseAdmin();
  const db = getFirestore();

  const startedAt = new Date();
  console.log("Sync Started");

  const configRef = db.doc("integrations/googleSheetsSync");
  const runsCol = configRef.collection("runs");

  try {
    const configSnap = await configRef.get();
    const columnOverrides = configSnap.exists ? configSnap.data().columnMapping ?? null : null;

    const accessToken = await getSheetsAccessToken();
    const rows = await fetchSheetRows(spreadsheetId, sheetName, accessToken);
    if (rows.length < 2) {
      console.log("0 new rows found (sheet has no data rows).");
    }

    const headerRow = rows[0] ?? [];
    const headerFields = headerRow.map((h) => resolveHeader(h, columnOverrides));
    const dataRows = rows.slice(1);
    console.log(`${dataRows.length} rows found`);

    const { imported, duplicates, failed, failedRows, rowsFound } = await processDataRows(db, {
      headerFields,
      dataRows,
      columnOverrides,
    });

    console.log(`${imported} leads imported`);
    console.log(`${duplicates} duplicates skipped`);
    console.log(`${failed} failed`);

    const finishedAt = new Date();
    await runsCol.add({
      status: "success",
      triggeredBy,
      startedAt,
      finishedAt,
      rowsFound,
      importedCount: imported,
      duplicateCount: duplicates,
      failedCount: failed,
      failedRows: failedRows.slice(0, 50),
      error: null,
    });
    await configRef.set(
      {
        spreadsheetId,
        sheetName,
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncStatus: "success",
        totalImported: FieldValue.increment(imported),
        totalDuplicates: FieldValue.increment(duplicates),
        totalFailed: FieldValue.increment(failed),
      },
      { merge: true }
    );

    console.log("Sync Completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Sync failed before completing:", message);
    await runsCol
      .add({
        status: "failed",
        triggeredBy,
        startedAt,
        finishedAt: new Date(),
        rowsFound: 0,
        importedCount: 0,
        duplicateCount: 0,
        failedCount: 0,
        failedRows: [],
        error: message,
      })
      .catch(() => {});
    await configRef.set({ lastSyncAt: FieldValue.serverTimestamp(), lastSyncStatus: "failed" }, { merge: true }).catch(() => {});
    process.exitCode = 1;
  }
}

// Only run when invoked directly (`node scripts/sync-google-sheets-leads.mjs`),
// not when imported by a test for its exported functions.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

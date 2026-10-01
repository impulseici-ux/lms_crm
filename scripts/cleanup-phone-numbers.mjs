// Optional, safe cleanup for `leads.parentPhone` values stored before phone
// normalization was added (e.g. "P:+919841234567" from the Google Sheets sync).
//
// Defaults to a DRY RUN: prints every record it would change, changes nothing.
// Only a lead whose current value fails validation AND whose normalized
// candidate newly validates gets touched — an already-valid number is left
// alone, and a genuinely unparseable one is left alone rather than guessed at.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/cleanup-phone-numbers.mjs            # dry run (default)
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/cleanup-phone-numbers.mjs --apply    # actually writes
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { normalizeLeadPhone, isValidLeadPhone } from "./lib/phone.mjs";

function initFirebaseAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    initializeApp({ credential: cert(JSON.parse(raw)) });
    return;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault() });
    return;
  }
  throw new Error("Set FIREBASE_SERVICE_ACCOUNT_KEY (inline JSON) or GOOGLE_APPLICATION_CREDENTIALS (file path).");
}

async function main() {
  const apply = process.argv.includes("--apply");
  initFirebaseAdmin();
  const db = getFirestore();

  const snap = await db.collection("leads").get();
  let candidates = 0;
  let unparseable = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const current = doc.data().parentPhone;
    if (isValidLeadPhone(current)) continue; // already clean, leave it alone

    const normalized = normalizeLeadPhone(current ?? "");
    if (!normalized.valid) {
      unparseable++;
      console.log(`[unparseable, left as-is] ${doc.id}: ${JSON.stringify(current)}`);
      continue;
    }

    candidates++;
    console.log(`[${apply ? "FIXING" : "would fix"}] ${doc.id}: ${JSON.stringify(current)} -> ${normalized.value}`);
    if (apply) {
      batch.update(doc.ref, { parentPhone: normalized.value, updatedAt: FieldValue.serverTimestamp() });
      batchCount++;
      if (batchCount === 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }
  if (apply && batchCount > 0) await batch.commit();

  console.log(`\n${candidates} record(s) ${apply ? "fixed" : "would be fixed"}.`);
  console.log(`${unparseable} record(s) left as-is (can't be reliably parsed).`);
  if (!apply && candidates > 0) {
    console.log("\nThis was a dry run — nothing was written. Re-run with --apply to actually update these records.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

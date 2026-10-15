// Firestore Security Rules regression test for school finance's monthly-closing
// integrity guard (firestore.rules' isAccountingMonth() + its 5 call sites).
//
// Every finance write collection (financeIncome, financeExpenses, salaryAdvances,
// payrollPayments, expenseSettlements) stores `accountingMonth` as a field
// independent of its own date field (transactionDate/issueDate/settlementDate) —
// intentional, since the app lets staff book a late-discovered expense into the
// current open month, or a payroll pay-date land a few days after the month it's
// for. The monthly-closing guard (`!exists(financeClosings/$(accountingMonth))`)
// only ever checks that literal string. Before isAccountingMonth() existed, a
// missing/malformed accountingMonth (empty string, garbage) could never
// string-match a real financeClosings document, so it could never be swept into a
// closing or grouped correctly in reports — a permanent, silent evasion.
//
// This test proves: (1) the legitimate independent-field pattern still works,
// (2) malformed accountingMonth values are now rejected, (3) well-formed/matching
// entries still work, and (4) the pre-existing closed-month rejection still works.
//
// Usage (from the web/ directory, with the Firestore + Auth emulators already
// running — e.g. `firebase emulators:start --only auth,firestore`):
//   node scripts/test-finance-rules.mjs
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

import { initializeApp as initAdminApp, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithCustomToken } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, collection, doc, setDoc, serverTimestamp } from "firebase/firestore";

const PROJECT_ID = "lms-crm-dev";

// Clear prior Firestore emulator state first — this test is not idempotent against
// leftover data from a previous run (e.g. a "2026-10" financeClosings doc created by
// the closed-month case below would make the earlier "well-formed" cases fail too).
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });

const adminApp = initAdminApp({ projectId: PROJECT_ID, credential: applicationDefault() });
const adminAuth = getAdminAuth(adminApp);

const uid = "test-mgmt-" + Date.now();
await adminAuth.createUser({ uid, email: `${uid}@test.local`, password: "password123" });
await adminAuth.setCustomUserClaims(uid, { role: "management" });

const app = initializeApp({ apiKey: "fake", projectId: PROJECT_ID });
const clientAuth = getAuth(app);
connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);

const customToken = await adminAuth.createCustomToken(uid, { role: "management" });
await signInWithCustomToken(clientAuth, customToken);
// Force a token refresh so the custom claims are present in the ID token rules see.
await clientAuth.currentUser.getIdToken(true);

let passed = 0;
let failed = 0;

async function expectAllow(label, fn) {
  try {
    await fn();
    console.log(`PASS (allowed as expected): ${label}`);
    passed++;
  } catch (e) {
    console.log(`FAIL (should have been allowed): ${label} -> ${e.message}`);
    failed++;
  }
}

async function expectDeny(label, fn) {
  try {
    await fn();
    console.log(`FAIL (should have been denied): ${label}`);
    failed++;
  } catch (e) {
    if (/permission/i.test(e.message)) {
      console.log(`PASS (denied as expected): ${label}`);
      passed++;
    } else {
      console.log(`FAIL (wrong error): ${label} -> ${e.message}`);
      failed++;
    }
  }
}

const incomeCol = collection(db, "financeIncome");
const baseEntry = {
  title: "Test entry", category: "Fees", amount: 500, paymentMode: "Cash",
  status: "posted", createdBy: uid, linkedPayrollPaymentId: null, linkedLeadId: null,
  createdAt: serverTimestamp(),
};

await expectAllow(
  "well-formed accountingMonth, different month than transactionDate (legit backdated entry)",
  () => setDoc(doc(incomeCol), { ...baseEntry, transactionDate: "2025-12-20", accountingMonth: "2026-10" })
);

await expectDeny(
  "empty-string accountingMonth",
  () => setDoc(doc(incomeCol), { ...baseEntry, transactionDate: "2026-10-13", accountingMonth: "" })
);

await expectDeny(
  "garbage accountingMonth",
  () => setDoc(doc(incomeCol), { ...baseEntry, transactionDate: "2026-10-13", accountingMonth: "not-a-month" })
);

await expectAllow(
  "well-formed, matching month",
  () => setDoc(doc(incomeCol), { ...baseEntry, transactionDate: "2026-10-13", accountingMonth: "2026-10" })
);

await setDoc(doc(db, "financeClosings", "2026-10"), {
  createdBy: uid, accountingMonth: "2026-10",
  expectedCash: 0, expectedBank: 0, countedCash: 0, countedBank: 0,
  closedBy: "Test", notes: "", closedAt: serverTimestamp(),
});
await expectDeny(
  "entry into an already-closed month",
  () => setDoc(doc(incomeCol), { ...baseEntry, transactionDate: "2026-10-20", accountingMonth: "2026-10" })
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

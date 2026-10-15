// Firestore Security Rules + integration test suite for the school finance module.
//
// Exercises firestore.rules directly through the client SDK (not the Admin SDK,
// which bypasses rules entirely) as four different identities — unauthenticated,
// counsellor, management, admin — to prove the database itself enforces access
// control, not just the UI. Where a flow requires an atomic multi-document write
// (payroll+expense, advance+expense, advance recovery), this test performs the
// same batch/transaction shape schoolFinance.ts's real functions use, so it is
// testing the same write pattern the app issues, not just isolated rule clauses.
//
// Usage (from the web/ directory, with the Firestore + Auth emulators already
// running — e.g. `firebase emulators:start --only auth,firestore`):
//   node scripts/test-finance-rules.mjs
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

import { initializeApp as initAdminApp, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithCustomToken, signOut } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, setDoc, updateDoc,
  getDoc, writeBatch, serverTimestamp, Timestamp,
} from "firebase/firestore";

const PROJECT_ID = "lms-crm-dev";

await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });

const adminApp = initAdminApp({ projectId: PROJECT_ID, credential: applicationDefault() });
const adminAuth = getAdminAuth(adminApp);

/** One isolated Firebase client app + signed-in user per role, so all four
 * identities (including "no one signed in") can be exercised in the same run. */
async function makeClient(name, role) {
  const app = initializeApp({ apiKey: "fake", projectId: PROJECT_ID }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  if (role) {
    const uid = `test-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await adminAuth.createUser({ uid, email: `${uid}@test.local`, password: "password123" });
    await adminAuth.setCustomUserClaims(uid, { role });
    const token = await adminAuth.createCustomToken(uid, { role });
    await signInWithCustomToken(auth, token);
    await auth.currentUser.getIdToken(true);
    return { app, auth, db, uid, role };
  }
  return { app, auth, db, uid: null, role: null };
}

const management = await makeClient("mgmt", "management");
const admin = await makeClient("admin", "admin");
const counsellor = await makeClient("counsellor", "counsellor");
const anon = await makeClient("anon", null);

let passed = 0;
let failed = 0;
const results = [];

async function expectAllow(label, fn) {
  try {
    await fn();
    results.push({ label, status: "PASS" });
    passed++;
  } catch (e) {
    results.push({ label, status: "FAIL", detail: `should have been allowed -> ${e.message}` });
    failed++;
  }
}

async function expectDeny(label, fn) {
  try {
    await fn();
    results.push({ label, status: "FAIL", detail: "should have been denied" });
    failed++;
  } catch (e) {
    if (e.code === "permission-denied" || /permission/i.test(e.message)) {
      results.push({ label, status: "PASS" });
      passed++;
    } else {
      results.push({ label, status: "FAIL", detail: `wrong error -> ${e.code ?? ""} ${e.message}` });
      failed++;
    }
  }
}

function report(label, status) { console.log(`[${status}] ${label}`); }

// Seed one real CRM lead (via the admin test identity, which has standard lead-write
// access) so the linkedLeadId existence check has a real document to validate against.
const leadRef = doc(collection(admin.db, "leads"));
await setDoc(leadRef, {
  parentName: "Test Parent", childName: "Test Child", parentPhone: "+919999999999",
  sourceChannel: "Walk-in", status: "New Lead", priority: "Medium",
  assignedStaffId: null, createdByStaffId: admin.uid,
  nextFollowUpAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});

// ---------------------------------------------------------------------------
// 1. Unauthenticated access
// ---------------------------------------------------------------------------
console.log("\n== 1. Unauthenticated access ==");
await expectDeny("unauthenticated read of financeIncome", () => getDoc(doc(anon.db, "financeIncome", "doesnotmatter")));
await expectDeny("unauthenticated write to financeIncome", () =>
  setDoc(doc(collection(anon.db, "financeIncome")), {
    title: "x", category: "Fees", amount: 100, paymentMode: "Cash", status: "posted",
    createdBy: "nobody", linkedPayrollPaymentId: null, linkedLeadId: null,
    transactionDate: "2026-10-01", accountingMonth: "2026-10", createdAt: serverTimestamp(),
  })
);
await expectDeny("unauthenticated write to payrollPayments", () =>
  setDoc(doc(collection(anon.db, "payrollPayments")), { status: "paid", netAmount: 100 })
);

// ---------------------------------------------------------------------------
// 2. Role-based access: counsellor must be denied all finance reads/writes
// ---------------------------------------------------------------------------
console.log("\n== 2. Role-based access (counsellor denied, management/admin allowed) ==");
await expectDeny("counsellor read of financeIncome", () => getDoc(doc(counsellor.db, "financeIncome", "doesnotmatter")));
await expectDeny("counsellor read of payrollPayments", () => getDoc(doc(counsellor.db, "payrollPayments", "doesnotmatter")));
await expectDeny("counsellor write to financeExpenses", () =>
  setDoc(doc(collection(counsellor.db, "financeExpenses")), {
    title: "x", category: "Supplies", amount: 100, paymentMode: "Cash", status: "posted",
    createdBy: counsellor.uid, transactionDate: "2026-10-01", accountingMonth: "2026-10",
    createdAt: serverTimestamp(),
  })
);
await expectDeny("counsellor create schoolStaff", () =>
  setDoc(doc(collection(counsellor.db, "schoolStaff")), { name: "X", monthlySalary: 10000 })
);
// Sanity: counsellor still retains ordinary CRM access (role mapping untouched).
await expectAllow("counsellor can still read leads (CRM role mapping preserved)", () => getDoc(leadRef));

// ---------------------------------------------------------------------------
// 3. Malformed financial records
// ---------------------------------------------------------------------------
console.log("\n== 3. Malformed financial records ==");
const baseIncome = {
  title: "Test entry", category: "Fees", paymentMode: "Cash", status: "posted",
  createdBy: management.uid, linkedPayrollPaymentId: null, linkedLeadId: null,
  transactionDate: "2026-10-13", accountingMonth: "2026-10", createdAt: serverTimestamp(),
};
await expectDeny("negative amount", () => setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: -500 }));
await expectDeny("zero amount", () => setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 0 }));
await expectDeny("non-numeric amount", () => setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: "500" }));
await expectDeny("empty-string accountingMonth", () => setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 500, accountingMonth: "" }));
await expectDeny("garbage accountingMonth", () => setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 500, accountingMonth: "not-a-month" }));
await expectDeny("status not 'posted'", () => setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 500, status: "draft" }));
await expectDeny("linkedLeadId pointing at a nonexistent lead", () =>
  setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 500, linkedLeadId: "does-not-exist-12345" })
);
await expectAllow("linkedLeadId pointing at a real lead", () =>
  setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 500, linkedLeadId: leadRef.id })
);
await expectAllow("well-formed, matching month (baseline)", () =>
  setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 500 })
);
await expectDeny("schoolStaff with zero salary", () =>
  setDoc(doc(collection(management.db, "schoolStaff")), { name: "Test Staff", roleTitle: "Teacher", mobile: "+919999999999", monthlySalary: 0, joiningDate: "2026-01-01", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
);
await expectDeny("schoolStaff with empty name", () =>
  setDoc(doc(collection(management.db, "schoolStaff")), { name: "", roleTitle: "Teacher", mobile: "+919999999999", monthlySalary: 15000, joiningDate: "2026-01-01", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
);

// Dashboard/report totals split Cash vs. Bank by string-matching `paymentMode`
// against a fixed 5-value set (FinanceOverview.tsx's `bankModes` + "Cash"). A value
// outside that set — or a missing one — would silently drop out of BOTH buckets
// while still counting toward the overall month total, breaking reconciliation.
// These prove a direct Firestore write (bypassing the UI's fixed dropdown) can't
// smuggle one in.
await expectDeny("invalid paymentMode string", () =>
  setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 500, paymentMode: "Crypto" })
);
await expectDeny("missing paymentMode", () => {
  const rest = { ...baseIncome };
  delete rest.paymentMode;
  return setDoc(doc(collection(management.db, "financeIncome")), { ...rest, amount: 500 });
});
await expectDeny("invalid paymentMode on financeExpenses", () =>
  setDoc(doc(collection(management.db, "financeExpenses")), {
    title: "Office supplies", category: "Operations", amount: 500, paymentMode: "Crypto", status: "posted",
    createdBy: management.uid, linkedPayrollPaymentId: null, linkedSalaryAdvanceId: null, linkedLeadId: null,
    transactionDate: "2026-10-13", accountingMonth: "2026-10", createdAt: serverTimestamp(),
  })
);

// A real staff member for the payroll/advance tests below.
const staffRef = doc(collection(management.db, "schoolStaff"));
await setDoc(staffRef, { name: "Priya Teacher", roleTitle: "Teacher", mobile: "+919999999999", monthlySalary: 20000, joiningDate: "2026-01-01", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const staffId = staffRef.id;

// ---------------------------------------------------------------------------
// 4. Atomic payroll + expense linking
// ---------------------------------------------------------------------------
console.log("\n== 4. Atomic payroll + expense linking ==");

async function payStaffMonth(db, uid, { accountingMonth, staffName, salaryAmount, deductions = 0, advanceRecovery = 0, advanceId = null, transactionDate }) {
  const netAmount = salaryAmount - deductions - advanceRecovery;
  const safeStaffId = staffId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const paymentId = `${accountingMonth}_${safeStaffId}`;
  const paymentRef = doc(db, "payrollPayments", paymentId);
  const expenseRef = doc(db, "financeExpenses", `payroll_${paymentId}`);
  const batch = writeBatch(db);
  batch.set(paymentRef, {
    staffId, staffName, accountingMonth, salaryAmount, deductions, advanceRecovery,
    advanceId, netAmount, paymentMode: "Bank Transfer", transactionDate, expenseId: expenseRef.id,
    createdBy: uid, createdAt: serverTimestamp(), status: "paid",
  });
  batch.set(expenseRef, {
    title: `Salary — ${staffName}`, category: "Staff Salary", amount: netAmount,
    transactionDate, accountingMonth, paymentMode: "Bank Transfer", reference: paymentId,
    notes: "test", createdBy: uid, createdAt: serverTimestamp(), status: "posted",
    linkedLeadId: null, linkedPayrollPaymentId: paymentId, linkedSalaryAdvanceId: null,
  });
  if (advanceId && advanceRecovery > 0) {
    const advSnap = await getDoc(doc(db, "salaryAdvances", advanceId));
    const adv = advSnap.data();
    const outstandingAmount = adv.outstandingAmount - advanceRecovery;
    batch.update(doc(db, "salaryAdvances", advanceId), {
      recoveredAmount: adv.recoveredAmount + advanceRecovery, outstandingAmount,
      status: outstandingAmount === 0 ? "repaid" : "open", lastRecoveredPaymentId: paymentId,
      updatedAt: serverTimestamp(),
    });
  }
  return batch.commit();
}

await expectDeny("payrollPayments created WITHOUT its matching expense in the same batch (breaks atomicity)", async () => {
  const paymentRef = doc(management.db, "payrollPayments", "2026-10_orphan");
  await setDoc(paymentRef, {
    staffId, staffName: "Priya Teacher", accountingMonth: "2026-10", salaryAmount: 20000,
    deductions: 0, advanceRecovery: 0, advanceId: null, netAmount: 20000, paymentMode: "Cash",
    transactionDate: "2026-10-05", expenseId: "nonexistent-expense-id", createdBy: management.uid,
    createdAt: serverTimestamp(), status: "paid",
  });
});

await expectDeny("financeExpenses linked to payroll with mismatched amount (tamper attempt)", async () => {
  const batch = writeBatch(management.db);
  const paymentRef = doc(management.db, "payrollPayments", "2026-10_tamper");
  const expenseRef = doc(management.db, "financeExpenses", "payroll_2026-10_tamper");
  batch.set(paymentRef, {
    staffId, staffName: "Priya Teacher", accountingMonth: "2026-10", salaryAmount: 20000,
    deductions: 0, advanceRecovery: 0, advanceId: null, netAmount: 20000, paymentMode: "Cash",
    transactionDate: "2026-10-05", expenseId: expenseRef.id, createdBy: management.uid,
    createdAt: serverTimestamp(), status: "paid",
  });
  batch.set(expenseRef, {
    title: "Salary", category: "Staff Salary", amount: 999999, // mismatched vs netAmount
    transactionDate: "2026-10-05", accountingMonth: "2026-10", paymentMode: "Cash",
    reference: "2026-10_tamper", createdBy: management.uid, createdAt: serverTimestamp(), status: "posted",
    linkedLeadId: null, linkedPayrollPaymentId: "2026-10_tamper", linkedSalaryAdvanceId: null,
  });
  await batch.commit();
});

await expectAllow("correctly-linked payroll + expense created atomically", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2026-10", staffName: "Priya Teacher", salaryAmount: 20000, transactionDate: "2026-10-05" })
);

// ---------------------------------------------------------------------------
// 5. Duplicate payroll payment prevention
// ---------------------------------------------------------------------------
console.log("\n== 5. Duplicate payroll payment prevention ==");
await expectDeny("second payroll payment for the same staff+month (deterministic ID collision)", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2026-10", staffName: "Priya Teacher", salaryAmount: 20000, transactionDate: "2026-10-06" })
);
await expectAllow("payroll payment for the SAME staff but a DIFFERENT month is allowed", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2026-11", staffName: "Priya Teacher", salaryAmount: 20000, transactionDate: "2026-11-05" })
);

// ---------------------------------------------------------------------------
// 6. Salary advance recovery bounds
// ---------------------------------------------------------------------------
console.log("\n== 6. Salary advance recovery bounds ==");

async function createAdvance(db, uid, amount, accountingMonth, issueDate) {
  const advanceRef = doc(collection(db, "salaryAdvances"));
  const expenseRef = doc(db, "financeExpenses", `advance_${advanceRef.id}`);
  const batch = writeBatch(db);
  batch.set(advanceRef, {
    staffId, staffName: "Priya Teacher", amount, recoveredAmount: 0, outstandingAmount: amount,
    issueDate, accountingMonth, reason: "test advance", paymentMode: "Cash", expenseId: expenseRef.id,
    createdBy: uid, createdAt: serverTimestamp(), status: "open", lastRecoveredPaymentId: null,
  });
  batch.set(expenseRef, {
    title: "Salary advance", category: "Salary Advance", amount, transactionDate: issueDate,
    accountingMonth, paymentMode: "Cash", reference: advanceRef.id, notes: "test", createdBy: uid,
    createdAt: serverTimestamp(), status: "posted", linkedLeadId: null, linkedPayrollPaymentId: null,
    linkedSalaryAdvanceId: advanceRef.id,
  });
  await batch.commit();
  return advanceRef;
}

const advanceRef = await createAdvance(management.db, management.uid, 5000, "2026-11", "2026-11-01");

await expectDeny("advance recovery exceeding the outstanding balance", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2026-12", staffName: "Priya Teacher", salaryAmount: 20000, advanceRecovery: 999999, advanceId: advanceRef.id, transactionDate: "2026-12-05" })
);
await expectAllow("partial, in-bounds advance recovery", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2026-12", staffName: "Priya Teacher", salaryAmount: 20000, advanceRecovery: 2000, advanceId: advanceRef.id, transactionDate: "2026-12-05" })
);
const afterPartial = await getDoc(advanceRef);
if (afterPartial.data().outstandingAmount === 3000 && afterPartial.data().status === "open") {
  report("advance outstanding correctly reduced to 3000 after partial recovery, status still 'open'", "PASS"); passed++;
} else {
  report(`advance outstanding wrong after partial recovery: ${JSON.stringify(afterPartial.data())}`, "FAIL"); failed++;
}
await expectDeny("second recovery exceeding the now-smaller remaining balance (5000-2000=3000 outstanding, attempting 4000)", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2027-01", staffName: "Priya Teacher", salaryAmount: 20000, advanceRecovery: 4000, advanceId: advanceRef.id, transactionDate: "2027-01-05" })
);
await expectAllow("final recovery exactly clearing the remaining balance (3000) marks it repaid", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2027-01", staffName: "Priya Teacher", salaryAmount: 20000, advanceRecovery: 3000, advanceId: advanceRef.id, transactionDate: "2027-01-05" })
);
const afterFull = await getDoc(advanceRef);
if (afterFull.data().status === "repaid" && afterFull.data().outstandingAmount === 0) {
  report("advance correctly marked 'repaid' with outstandingAmount 0 after full recovery", "PASS"); passed++;
} else {
  report(`advance status/outstanding wrong after full recovery: ${JSON.stringify(afterFull.data())}`, "FAIL"); failed++;
}
await expectDeny("recovery attempted on an already-fully-repaid advance", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2027-02", staffName: "Priya Teacher", salaryAmount: 20000, advanceRecovery: 1, advanceId: advanceRef.id, transactionDate: "2027-02-05" })
);
await expectDeny("direct tamper: manually inflate recoveredAmount without a matching payroll payment", () =>
  updateDoc(advanceRef, { recoveredAmount: 99999, outstandingAmount: -94999, status: "open", lastRecoveredPaymentId: "fake-id", updatedAt: serverTimestamp() })
);

// ---------------------------------------------------------------------------
// 7. Reimbursement settlement integrity
// ---------------------------------------------------------------------------
console.log("\n== 7. Reimbursement settlement integrity ==");

const nonReimbExpenseRef = doc(collection(management.db, "financeExpenses"));
await setDoc(nonReimbExpenseRef, {
  title: "Office supplies", category: "Supplies", amount: 1200, transactionDate: "2026-10-10",
  accountingMonth: "2026-10", paymentMode: "Cash", createdBy: management.uid, createdAt: serverTimestamp(),
  status: "posted", linkedLeadId: null, linkedPayrollPaymentId: null, linkedSalaryAdvanceId: null,
});
await expectDeny("settling a non-Reimbursement-category expense", () =>
  setDoc(doc(management.db, "expenseSettlements", nonReimbExpenseRef.id), {
    expenseId: nonReimbExpenseRef.id, amount: 1200, settlementDate: "2026-10-15",
    accountingMonth: "2026-10", paymentMode: "Cash", createdBy: management.uid, createdAt: serverTimestamp(),
  })
);

const reimbExpenseRef = doc(collection(management.db, "financeExpenses"));
await setDoc(reimbExpenseRef, {
  title: "Management paid for stationery", category: "Reimbursement", amount: 800,
  transactionDate: "2026-10-10", accountingMonth: "2026-10", paymentMode: "Cash", paidBy: "Mrs. Director",
  createdBy: management.uid, createdAt: serverTimestamp(), status: "posted",
  linkedLeadId: null, linkedPayrollPaymentId: null, linkedSalaryAdvanceId: null,
});
await expectDeny("settlement amount mismatched against the original expense amount", () =>
  setDoc(doc(management.db, "expenseSettlements", reimbExpenseRef.id), {
    expenseId: reimbExpenseRef.id, amount: 1, settlementDate: "2026-10-15",
    accountingMonth: "2026-10", paymentMode: "Cash", createdBy: management.uid, createdAt: serverTimestamp(),
  })
);
await expectAllow("correct reimbursement settlement", () =>
  setDoc(doc(management.db, "expenseSettlements", reimbExpenseRef.id), {
    expenseId: reimbExpenseRef.id, amount: 800, settlementDate: "2026-10-15",
    accountingMonth: "2026-10", paymentMode: "Cash", createdBy: management.uid, createdAt: serverTimestamp(),
  })
);
await expectDeny("double-settling the same reimbursement (counting the expense twice)", () =>
  setDoc(doc(management.db, "expenseSettlements", reimbExpenseRef.id), {
    expenseId: reimbExpenseRef.id, amount: 800, settlementDate: "2026-10-16",
    accountingMonth: "2026-10", paymentMode: "Cash", createdBy: management.uid, createdAt: serverTimestamp(),
  })
);

// ---------------------------------------------------------------------------
// 8. Monthly closing + closed-month bypass across all 5 collections
// ---------------------------------------------------------------------------
console.log("\n== 8. Monthly closing + closed-month bypass ==");
await expectDeny("counsellor attempting to close a month", () =>
  setDoc(doc(counsellor.db, "financeClosings", "2026-09"), {
    createdBy: counsellor.uid, accountingMonth: "2026-09", expectedCash: 0, expectedBank: 0,
    countedCash: 0, countedBank: 0, closedBy: "Test", notes: "", closedAt: serverTimestamp(),
  })
);
await expectAllow("management closes a month", () =>
  setDoc(doc(management.db, "financeClosings", "2026-09"), {
    createdBy: management.uid, accountingMonth: "2026-09", expectedCash: 0, expectedBank: 0,
    countedCash: 0, countedBank: 0, closedBy: "Test", notes: "", closedAt: serverTimestamp(),
  })
);
await expectDeny("re-closing an already-closed month (overwrite attempt)", () =>
  setDoc(doc(management.db, "financeClosings", "2026-09"), {
    createdBy: management.uid, accountingMonth: "2026-09", expectedCash: 1, expectedBank: 1,
    countedCash: 1, countedBank: 1, closedBy: "Test", notes: "tamper", closedAt: serverTimestamp(),
  })
);
await expectDeny("financeIncome into the closed month", () =>
  setDoc(doc(collection(management.db, "financeIncome")), { ...baseIncome, amount: 500, transactionDate: "2026-09-15", accountingMonth: "2026-09" })
);
await expectDeny("financeExpenses into the closed month", () =>
  setDoc(doc(collection(management.db, "financeExpenses")), { title: "x", category: "Supplies", amount: 100, paymentMode: "Cash", status: "posted", createdBy: management.uid, transactionDate: "2026-09-15", accountingMonth: "2026-09", createdAt: serverTimestamp() })
);
await expectDeny("salaryAdvances into the closed month", () =>
  createAdvance(management.db, management.uid, 1000, "2026-09", "2026-09-15")
);
await expectDeny("payrollPayments into the closed month", () =>
  payStaffMonth(management.db, management.uid, { accountingMonth: "2026-09", staffName: "Priya Teacher", salaryAmount: 20000, transactionDate: "2026-09-15" })
);
await expectDeny("expenseSettlements into the closed month", () => {
  const expRef = doc(collection(management.db, "financeExpenses"));
  return setDoc(expRef, {
    title: "x", category: "Reimbursement", amount: 100, transactionDate: "2026-10-01",
    accountingMonth: "2026-10", paymentMode: "Cash", paidBy: "Someone", createdBy: management.uid,
    createdAt: serverTimestamp(), status: "posted", linkedLeadId: null, linkedPayrollPaymentId: null, linkedSalaryAdvanceId: null,
  }).then(() => setDoc(doc(management.db, "expenseSettlements", expRef.id), {
    expenseId: expRef.id, amount: 100, settlementDate: "2026-09-20", accountingMonth: "2026-09",
    paymentMode: "Cash", createdBy: management.uid, createdAt: serverTimestamp(),
  }));
});
await expectDeny("financeClosings doc ID not matching a real YYYY-MM (malformed close)", () =>
  setDoc(doc(management.db, "financeClosings", "garbage"), {
    createdBy: management.uid, accountingMonth: "garbage", expectedCash: 0, expectedBank: 0,
    countedCash: 0, countedBank: 0, closedBy: "Test", notes: "", closedAt: serverTimestamp(),
  })
);

// ---------------------------------------------------------------------------
// 9. Admin has the same finance access as management (role parity)
// ---------------------------------------------------------------------------
console.log("\n== 9. Admin role parity with management ==");
await expectAllow("admin can read financeIncome (nonexistent doc resolves, not denied)", () => getDoc(doc(admin.db, "financeIncome", "doesnotmatter")));
await expectAllow("admin can create a finance income entry", () =>
  setDoc(doc(collection(admin.db, "financeIncome")), { ...baseIncome, amount: 250, createdBy: admin.uid, accountingMonth: "2026-10" })
);

console.log(`\n${passed} passed, ${failed} failed`);
for (const r of results) if (r.status === "FAIL") console.log(`  FAILED: ${r.label} (${r.detail})`);

for (const c of [management, admin, counsellor, anon]) { await signOut(c.auth).catch(() => {}); await deleteApp(c.app).catch(() => {}); }
process.exit(failed > 0 ? 1 : 0);

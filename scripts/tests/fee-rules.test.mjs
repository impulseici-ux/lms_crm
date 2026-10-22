// Isolated Firestore-emulator test for the class-wise Total Fee system.
// Run via: firebase emulators:exec --only firestore "node scripts/tests/fee-rules.test.mjs"
// Uses only synthetic test data — never touches production.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import {
  doc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";

const PROJECT_ID = "lms-crm-fee-rules-test";

let pass = 0;
let fail = 0;
function report(name, ok, detail) {
  if (ok) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
async function check(name, promise, expect) {
  try {
    if (expect === "allow") { await assertSucceeds(promise); report(name, true); }
    else { await assertFails(promise); report(name, true); }
  } catch (e) {
    report(name, false, e.message);
  }
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });

  const admin = testEnv.authenticatedContext("admin-uid", { role: "admin" });
  const counsellor = testEnv.authenticatedContext("counsellor-uid", { role: "counsellor" });
  const anon = testEnv.unauthenticatedContext();

  const adminDb = admin.firestore();
  const counsellorDb = counsellor.firestore();
  const anonDb = anon.firestore();

  // --- Seed baseline reference data as admin (bypassing rules via withSecurityRulesDisabled
  // for setup only; the actual test assertions below always go through the real rules). ---
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "programs", "DR"), { name: "Developing Roots", active: true, sortOrder: 0 });
    await setDoc(doc(db, "programs", "EW"), { name: "Emerging Wings", active: true, sortOrder: 1 });
    await setDoc(doc(db, "programs", "RTF1"), { name: "Ready To Fly 1", active: true, sortOrder: 2 });
    await setDoc(doc(db, "programs", "RTF2"), { name: "Ready To Fly 2", active: true, sortOrder: 3 });
    await setDoc(doc(db, "admissionTypes", "vijayadasami"), { name: "Vijayadasami", active: true, sortOrder: 0 });
    await setDoc(doc(db, "admissionTypes", "academicYear"), { name: "Academic Year", active: true, sortOrder: 1 });
    await setDoc(doc(db, "academicYears", "2026-27"), { name: "2026-27", active: true, sortOrder: 0 });
    await setDoc(doc(db, "academicYears", "2027-28"), { name: "2027-28", active: true, sortOrder: 1 });
  });

  console.log("\n== Fee structure creation / draft rules ==");

  await check(
    "admin can create a draft fee structure",
    setDoc(doc(adminDb, "feeStructures", "fs1"), {
      name: "Vijayadasami Admission 2026-27",
      admissionTypeId: "vijayadasami",
      academicYearId: "2026-27",
      classFees: { DR: 39100, EW: 41300, RTF1: 43800, RTF2: 46100 },
      status: "draft",
      createdBy: "admin-uid",
      createdAt: serverTimestamp(),
      updatedBy: "admin-uid",
      updatedAt: serverTimestamp(),
      activatedBy: null, activatedAt: null, deactivatedBy: null, deactivatedAt: null,
    }),
    "allow"
  );

  await check(
    "counsellor cannot create a fee structure",
    setDoc(doc(counsellorDb, "feeStructures", "fs-bad"), {
      name: "Hacked", admissionTypeId: "vijayadasami", academicYearId: "2026-27",
      classFees: { DR: 1 }, status: "draft", createdBy: "counsellor-uid",
      createdAt: serverTimestamp(), updatedBy: "counsellor-uid", updatedAt: serverTimestamp(),
      activatedBy: null, activatedAt: null, deactivatedBy: null, deactivatedAt: null,
    }),
    "deny"
  );

  await check(
    "a create cannot start as already-active",
    setDoc(doc(adminDb, "feeStructures", "fs-preactive"), {
      name: "Sneaky", admissionTypeId: "vijayadasami", academicYearId: "2027-28",
      classFees: { DR: 1 }, status: "active", createdBy: "admin-uid",
      createdAt: serverTimestamp(), updatedBy: "admin-uid", updatedAt: serverTimestamp(),
      activatedBy: "admin-uid", activatedAt: serverTimestamp(), deactivatedBy: null, deactivatedAt: null,
    }),
    "deny"
  );

  await check(
    "admin can edit a draft's classFees",
    updateDoc(doc(adminDb, "feeStructures", "fs1"), {
      classFees: { DR: 39100, EW: 41300, RTF1: 43800, RTF2: 46100 },
      updatedBy: "admin-uid", updatedAt: serverTimestamp(),
    }),
    "allow"
  );

  await check(
    "editing a draft cannot also flip it to active in the same write",
    updateDoc(doc(adminDb, "feeStructures", "fs1"), {
      status: "active", classFees: { DR: 1 },
      updatedBy: "admin-uid", updatedAt: serverTimestamp(),
    }),
    "deny"
  );

  console.log("\n== Activation / conflict prevention ==");

  await check(
    "admin can activate fs1 (draft -> active) with the pointer doc",
    (async () => {
      await testEnv.withSecurityRulesDisabled(async () => {}); // no-op, batches need both docs via a single client txn
      const { writeBatch } = await import("firebase/firestore");
      const batch = writeBatch(adminDb);
      batch.set(doc(adminDb, "activeFeeStructures", "vijayadasami_2026-27"), {
        feeStructureId: "fs1", setBy: "admin-uid", setAt: serverTimestamp(),
      });
      batch.update(doc(adminDb, "feeStructures", "fs1"), {
        status: "active", activatedBy: "admin-uid", activatedAt: serverTimestamp(),
      });
      return batch.commit();
    })(),
    "allow"
  );

  // Second structure for same admission type + academic year, attempting to also activate.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "feeStructures", "fs2"), {
      name: "Vijayadasami Admission 2026-27 (v2)",
      admissionTypeId: "vijayadasami", academicYearId: "2026-27",
      classFees: { DR: 50000, EW: 52000, RTF1: 54000, RTF2: 56000 },
      status: "draft", createdBy: "admin-uid",
      createdAt: serverTimestamp(), updatedBy: "admin-uid", updatedAt: serverTimestamp(),
      activatedBy: null, activatedAt: null, deactivatedBy: null, deactivatedAt: null,
    });
  });

  await check(
    "a second active structure for the same admission type + academic year is rejected",
    (async () => {
      const { writeBatch } = await import("firebase/firestore");
      const batch = writeBatch(adminDb);
      batch.update(doc(adminDb, "activeFeeStructures", "vijayadasami_2026-27"), {
        feeStructureId: "fs2", setBy: "admin-uid", setAt: serverTimestamp(),
      });
      batch.update(doc(adminDb, "feeStructures", "fs2"), {
        status: "active", activatedBy: "admin-uid", activatedAt: serverTimestamp(),
      });
      return batch.commit();
    })(),
    "deny"
  );

  console.log("\n== Admission confirmation (leads) — trusted server-side fee check ==");

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "leads", "lead1"), {
      parentName: "Test Parent", childName: "Test Child", parentPhone: "9999999999",
      status: "Admission Discussion", createdByStaffId: "counsellor-uid", assignedStaffId: "counsellor-uid",
      interestedProgramId: "DR", nextFollowUpAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
      admissionTypeId: null, academicYearId: null, admissionFeeStructureId: null, admissionTotalFee: null,
    });
  });

  await check(
    "confirming admission with the correct looked-up fee succeeds",
    updateDoc(doc(counsellorDb, "leads", "lead1"), {
      status: "Admission Confirmed",
      interestedProgramId: "DR",
      admissionTypeId: "vijayadasami",
      academicYearId: "2026-27",
      admissionFeeStructureId: "fs1",
      admissionTotalFee: 39100,
      updatedAt: serverTimestamp(),
    }),
    "allow"
  );

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "leads", "lead2"), {
      parentName: "Test Parent 2", childName: "Test Child 2", parentPhone: "9999999998",
      status: "Admission Discussion", createdByStaffId: "counsellor-uid", assignedStaffId: "counsellor-uid",
      interestedProgramId: "DR", nextFollowUpAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
      admissionTypeId: null, academicYearId: null, admissionFeeStructureId: null, admissionTotalFee: null,
    });
  });

  await check(
    "confirming admission with a tampered (too-high) fee is rejected",
    updateDoc(doc(counsellorDb, "leads", "lead2"), {
      status: "Admission Confirmed",
      interestedProgramId: "DR",
      admissionTypeId: "vijayadasami",
      academicYearId: "2026-27",
      admissionFeeStructureId: "fs1",
      admissionTotalFee: 999999,
      updatedAt: serverTimestamp(),
    }),
    "deny"
  );

  await check(
    "confirming admission referencing a different (non-matching) fee structure id is rejected",
    updateDoc(doc(counsellorDb, "leads", "lead2"), {
      status: "Admission Confirmed",
      interestedProgramId: "DR",
      admissionTypeId: "vijayadasami",
      academicYearId: "2026-27",
      admissionFeeStructureId: "fs2", // fs2 never got the pointer; fs1 is the real active one
      admissionTotalFee: 39100,
      updatedAt: serverTimestamp(),
    }),
    "deny"
  );

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "leads", "lead3"), {
      parentName: "Test Parent 3", childName: "Test Child 3", parentPhone: "9999999997",
      status: "Admission Discussion", createdByStaffId: "counsellor-uid", assignedStaffId: "counsellor-uid",
      interestedProgramId: "EW", nextFollowUpAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
      admissionTypeId: null, academicYearId: null, admissionFeeStructureId: null, admissionTotalFee: null,
    });
  });

  await check(
    "confirming admission for a different admission type with no active structure is rejected",
    updateDoc(doc(counsellorDb, "leads", "lead3"), {
      status: "Admission Confirmed",
      interestedProgramId: "EW",
      admissionTypeId: "academicYear", // no active structure exists for academicYear_2026-27
      academicYearId: "2026-27",
      admissionFeeStructureId: "fs1",
      admissionTotalFee: 41300,
      updatedAt: serverTimestamp(),
    }),
    "deny"
  );

  console.log("\n== Historical fee preservation ==");

  await check(
    "deactivating the active structure does not touch confirmed admission fee data",
    (async () => {
      const { writeBatch } = await import("firebase/firestore");
      const batch = writeBatch(adminDb);
      batch.delete(doc(adminDb, "activeFeeStructures", "vijayadasami_2026-27"));
      batch.update(doc(adminDb, "feeStructures", "fs1"), {
        status: "inactive", deactivatedBy: "admin-uid", deactivatedAt: serverTimestamp(),
      });
      await batch.commit();
    })(),
    "allow"
  );

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const { getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(ctx.firestore(), "leads", "lead1"));
    report(
      "lead1's admissionTotalFee is unchanged after fs1 was deactivated",
      snap.data().admissionTotalFee === 39100
    );
  });

  await check(
    "editing fs1's classFees is rejected once it's no longer a draft (inactive)",
    updateDoc(doc(adminDb, "feeStructures", "fs1"), { classFees: { DR: 1 } }),
    "deny"
  );

  console.log("\n== Unauthorized access ==");

  await check(
    "unauthenticated client cannot read fee structures",
    (async () => {
      const { getDocs, collection } = await import("firebase/firestore");
      return getDocs(collection(anonDb, "feeStructures"));
    })(),
    "deny"
  );

  await check(
    "counsellor cannot activate a fee structure",
    updateDoc(doc(counsellorDb, "feeStructures", "fs2"), {
      status: "active", activatedBy: "counsellor-uid", activatedAt: serverTimestamp(),
    }),
    "deny"
  );

  await testEnv.cleanup();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

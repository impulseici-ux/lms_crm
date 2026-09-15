// Seeds the local Firebase Emulator Suite with demo staff, lookups and leads.
// Run with the emulators already started: `npm run seed` (see package.json / README).
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

initializeApp({ projectId: "lms-crm-dev" });
const auth = getAuth();
const db = getFirestore();

async function upsertStaff(email, password, displayName, role) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName });
  }
  await auth.setCustomUserClaims(user.uid, { role });
  await db.collection("users").doc(user.uid).set({
    displayName,
    email,
    role,
    branchId: null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return user.uid;
}

async function addLookup(col, name, sortOrder) {
  const ref = await db.collection(col).add({ name, active: true, sortOrder });
  return ref.id;
}

async function main() {
  console.log("Seeding staff…");
  const adminUid = await upsertStaff("admin@school.test", "password123", "Admin User", "admin");
  const counsellorUid = await upsertStaff("counsellor@school.test", "password123", "Priya Counsellor", "counsellor");
  const managementUid = await upsertStaff("management@school.test", "password123", "Management Viewer", "management");

  console.log("Seeding lead sources…");
  const sourceNames = [
    "Walk-in", "Phone Call", "WhatsApp", "Website — Enquiry Form", "Website — Organic Search",
    "Instagram", "Facebook", "Google Ads", "Meta Ads", "Referral — Existing Parent",
    "Referral — Staff", "Other / Manual",
  ];
  for (const [i, name] of sourceNames.entries()) await addLookup("leadSources", name, i);

  console.log("Seeding programs…");
  const programNames = ["Nursery", "LKG", "UKG", "Grade 1", "Grade 2", "Grade 3"];
  const programIds = [];
  for (const [i, name] of programNames.entries()) programIds.push(await addLookup("programs", name, i));

  console.log("Seeding a sample campaign…");
  const campaignRef = await db.collection("campaigns").add({
    name: "Vijayadasami Admission Campaign 2026",
    channels: ["Instagram", "Facebook", "Google Ads", "Website — Enquiry Form", "Walk-in"],
    startDate: Timestamp.fromDate(new Date("2026-09-01")),
    endDate: Timestamp.fromDate(new Date("2026-11-30")),
    notes: null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log("Seeding sample leads…");
  const now = Date.now();
  const sampleLeads = [
    { parentName: "Kavitha R", childName: "Aarav", status: "New Lead", source: "Walk-in", staff: counsellorUid, hoursAgo: 2, followUpInHours: 22 },
    { parentName: "Suresh Kumar", childName: "Meera", status: "Contacted", source: "Phone Call", staff: counsellorUid, hoursAgo: 30, followUpInHours: -5 },
    { parentName: "Divya M", childName: "Karthik", status: "Interested", source: "Instagram", staff: counsellorUid, hoursAgo: 24 * 6, followUpInHours: -48 },
    { parentName: "Ramesh P", childName: "Sanjana", status: "Visit Scheduled", source: "Website — Enquiry Form", staff: adminUid, hoursAgo: 24 * 2, followUpInHours: 24 },
    { parentName: "Anitha S", childName: "Vishnu", status: "Visit Completed", source: "Referral — Existing Parent", staff: adminUid, hoursAgo: 24 * 5, followUpInHours: -72 },
    { parentName: "Lakshmi N", childName: "Divakar", status: "Admission Confirmed", source: "Google Ads", staff: counsellorUid, hoursAgo: 24 * 20, followUpInHours: null },
    { parentName: "Bala Subramanian", childName: "Priya", status: "Not Interested", source: "Facebook", staff: counsellorUid, hoursAgo: 24 * 10, followUpInHours: null },
  ];

  for (const s of sampleLeads) {
    const createdAt = Timestamp.fromMillis(now - s.hoursAgo * 3600 * 1000);
    const nextFollowUpAt = s.followUpInHours == null ? null : Timestamp.fromMillis(now + s.followUpInHours * 3600 * 1000);
    const leadRef = await db.collection("leads").add({
      parentName: s.parentName,
      parentPhone: "+91 90000 00000",
      parentEmail: null,
      childName: s.childName,
      childAge: "4 years",
      childDob: null,
      interestedProgramId: programIds[0],
      branchId: null,
      sourceChannel: s.source,
      campaignId: campaignRef.id,
      utm: null,
      referralName: null,
      howHeardOther: null,
      status: s.status,
      priority: "Medium",
      assignedStaffId: s.staff,
      createdByStaffId: s.staff,
      nextFollowUpAt,
      nextFollowUpType: nextFollowUpAt ? "Call" : null,
      lastContactedAt: s.status === "New Lead" ? null : createdAt,
      lastActivityAt: createdAt,
      visitDate: null,
      visitNotes: null,
      admissionNumber: s.status === "Admission Confirmed" ? "ADM-2026-0001" : null,
      admissionFeePlan: null,
      admissionConfirmedAt: s.status === "Admission Confirmed" ? createdAt : null,
      householdId: null,
      notes: null,
      createdAt,
      updatedAt: createdAt,
    });
    await leadRef.collection("activities").add({
      type: "lead_created",
      byStaffId: s.staff,
      at: createdAt,
      text: `Lead captured via ${s.source}.`,
    });
  }

  console.log("Seed complete.");
  console.log("Log in as admin@school.test / counsellor@school.test / management@school.test, password: password123");
  console.log(`Admin UID: ${adminUid}`);
  console.log(`Counsellor UID: ${counsellorUid}`);
  console.log(`Management UID: ${managementUid}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

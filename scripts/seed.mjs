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
  const adminUid = await upsertStaff("admin@littlemillennium.local", "password123", "Admin User", "admin");
  const counsellorUid = await upsertStaff("counsellor@littlemillennium.local", "password123", "Priya Counsellor", "counsellor");
  const managementUid = await upsertStaff("management@littlemillennium.local", "password123", "Management Viewer", "management");

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
      parentPhone: "+919000000000",
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

  console.log("Seeding WhatsApp Automation defaults…");
  await db.collection("whatsappSettings").doc("config").set({
    schoolName: "Little Millennium Singanallur",
    schoolPhone: "+919944260036",
    schoolAddress: "Singanallur, Coimbatore, Tamil Nadu",
    futureProvider: null,
    futurePhoneNumberId: null,
    futureBusinessAccountId: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const templateDefs = [
    {
      key: "newLeadWelcome",
      name: "New Lead Welcome",
      category: "New Lead",
      content:
        "Hi {{parent_name}} 👋\n\nThank you for your interest in {{school_name}}.\n\nWe received your enquiry for {{child_name}}.\n\nOur team will contact you shortly.\n\nRegards,\n{{school_name}}",
    },
    {
      key: "visitConfirmation",
      name: "Visit Confirmation",
      category: "Visit",
      content:
        "Hi {{parent_name}} 👋\n\nYour visit to {{school_name}} has been scheduled.\n\nChild: {{child_name}}\nDate: {{visit_date}}\nTime: {{visit_time}}\n\nWe look forward to welcoming you.\n\nRegards,\n{{school_name}}",
    },
    {
      key: "visitReminder",
      name: "Visit Reminder",
      category: "Visit",
      content:
        "Hi {{parent_name}} 👋\n\nJust a reminder about your visit to {{school_name}} tomorrow for {{child_name}}.\n\nDate: {{visit_date}}\nTime: {{visit_time}}\n\nSee you soon!\n\nRegards,\n{{school_name}}",
    },
    {
      key: "visitCompleted",
      name: "Visit Completed",
      category: "Visit",
      content:
        "Hi {{parent_name}} 👋\n\nThank you for visiting {{school_name}} with {{child_name}}. We hope you liked what you saw!\n\nOur team will follow up shortly to answer any questions.\n\nRegards,\n{{school_name}}",
    },
    {
      key: "followUpReminder",
      name: "Follow-up Reminder",
      category: "Follow-up",
      content:
        "Hi {{parent_name}} 👋\n\nThis is {{staff_name}} from {{school_name}}. Just checking in about {{child_name}}'s admission — happy to answer any questions you may have.\n\nRegards,\n{{school_name}}",
    },
    {
      key: "admissionConfirmed",
      name: "Admission Confirmed",
      category: "Admission",
      content:
        "Hi {{parent_name}} 👋\n\nCongratulations! {{child_name}}'s admission to {{school_name}} is confirmed.\n\nOur team will share the next steps shortly.\n\nRegards,\n{{school_name}}",
    },
  ];

  const templateIds = {};
  for (const t of templateDefs) {
    const ref = await db.collection("whatsappTemplates").add({
      name: t.name,
      category: t.category,
      language: "English",
      content: t.content,
      active: true,
      createdByStaffId: adminUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    templateIds[t.key] = ref.id;
  }

  const automationDefs = [
    { name: "New Lead Welcome", trigger: "new_lead_created", condition: {}, templateKey: "newLeadWelcome", delayMinutes: 0 },
    {
      name: "Visit Confirmation",
      trigger: "visit_scheduled",
      condition: {},
      templateKey: "visitConfirmation",
      delayMinutes: 0,
    },
    {
      name: "Visit Reminder (1 day before)",
      trigger: "visit_scheduled",
      condition: { reminderDaysBeforeVisit: 1 },
      templateKey: "visitReminder",
      delayMinutes: 0,
    },
    { name: "Visit Completed Thank You", trigger: "visit_completed", condition: {}, templateKey: "visitCompleted", delayMinutes: 0 },
    { name: "Follow-up Due Reminder", trigger: "follow_up_due", condition: {}, templateKey: "followUpReminder", delayMinutes: 0 },
    { name: "Follow-up Overdue Reminder", trigger: "follow_up_overdue", condition: {}, templateKey: "followUpReminder", delayMinutes: 0 },
    { name: "Admission Confirmed", trigger: "admission_confirmed", condition: {}, templateKey: "admissionConfirmed", delayMinutes: 0 },
  ];

  for (const a of automationDefs) {
    await db.collection("whatsappAutomations").add({
      name: a.name,
      trigger: a.trigger,
      condition: a.condition,
      templateId: templateIds[a.templateKey],
      delayMinutes: a.delayMinutes,
      active: true,
      createdByStaffId: adminUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  console.log("Seed complete.");
  console.log("Log in as admin@littlemillennium.local / counsellor@littlemillennium.local / management@littlemillennium.local, password: password123");
  console.log(`Admin UID: ${adminUid}`);
  console.log(`Counsellor UID: ${counsellorUid}`);
  console.log(`Management UID: ${managementUid}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

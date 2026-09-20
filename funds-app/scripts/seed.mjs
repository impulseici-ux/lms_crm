#!/usr/bin/env node
// Seeds the LOCAL EMULATORS ONLY with a demo manager, two demo employees,
// and a handful of transactions so the app has something to show.
// Never point this at a real project.

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "localhost:9099";

initializeApp({ projectId: "littlemillennium-funds" });

const auth = getAuth();
const db = getFirestore();

async function upsertUser({ email, password, name, role }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName: name });
  }
  await auth.setCustomUserClaims(user.uid, { role });
  await db.collection("users").doc(user.uid).set({
    uid: user.uid,
    name,
    email,
    role,
    active: true,
    createdAt: new Date(),
  });
  return user.uid;
}

const managerUid = await upsertUser({
  email: "manager@company.test",
  password: "password123",
  name: "Priya Manager",
  role: "manager",
});

const employeeUid = await upsertUser({
  email: "employee@company.test",
  password: "password123",
  name: "Arun Kumar",
  role: "employee",
});

const employee2Uid = await upsertUser({
  email: "employee2@company.test",
  password: "password123",
  name: "Manoj Singh",
  role: "employee",
});

const today = new Date();
const month = today.toISOString().slice(0, 7);

const demoEntries = [
  { employeeId: employeeUid, employeeName: "Arun Kumar", type: "received", amount: 50000, note: "Site advance from office" },
  { employeeId: employeeUid, employeeName: "Arun Kumar", type: "spent", amount: 20000, note: "Arun Raj Kumar - labour payment" },
  { employeeId: employeeUid, employeeName: "Arun Kumar", type: "spent", amount: 1000, note: "Manoj Travels Sep 22." },
  { employeeId: employee2Uid, employeeName: "Manoj Singh", type: "received", amount: 30000, note: "Cash float" },
  { employeeId: employee2Uid, employeeName: "Manoj Singh", type: "spent", amount: 12500, note: "Cement, 20 bags" },
];

for (const entry of demoEntries) {
  await db.collection("transactions").add({
    ...entry,
    date: today.toISOString().slice(0, 10),
    month,
    createdBy: entry.employeeId,
    createdAt: new Date(),
  });
}

console.log("✅ Seeded manager, 2 employees, and demo transactions.");
console.log(`Manager uid: ${managerUid}`);
process.exit(0);

#!/usr/bin/env node
// Bootstraps the very first manager account: creates the Auth user (if it
// doesn't already exist), grants the 'manager' custom claim, and writes the
// matching /users profile doc. Run once per Firebase project.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/create-admin.mjs manager@company.test 'somePassword123' 'Jane Manager'

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const [, , email, password, name] = process.argv;

if (!email || !password || !name) {
  console.error(
    "Usage: node scripts/create-admin.mjs <email> <password> <full name>"
  );
  process.exit(1);
}

initializeApp({
  credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? applicationDefault()
    : cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
});

const auth = getAuth();
const db = getFirestore();

let user;
try {
  user = await auth.getUserByEmail(email);
  console.log(`Found existing user ${user.uid}, updating password/role...`);
  await auth.updateUser(user.uid, { password, displayName: name });
} catch {
  user = await auth.createUser({ email, password, displayName: name });
  console.log(`Created new user ${user.uid}`);
}

await auth.setCustomUserClaims(user.uid, { role: "manager" });

await db.collection("users").doc(user.uid).set(
  {
    uid: user.uid,
    name,
    email,
    role: "manager",
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);

console.log(`✅ ${email} is now a manager (uid: ${user.uid}).`);
process.exit(0);

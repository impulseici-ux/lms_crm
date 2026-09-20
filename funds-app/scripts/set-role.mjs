#!/usr/bin/env node
// Grants a role to an EXISTING employee, without needing the Blaze plan /
// Cloud Functions. Use this for day-to-day role management while on Spark.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/set-role.mjs <uid> <email> <manager|employee> "Full Name"

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const [, , uid, email, role, name] = process.argv;

if (!uid || !email || !role || !["manager", "employee"].includes(role)) {
  console.error(
    "Usage: node scripts/set-role.mjs <uid> <email> <manager|employee> [\"Full Name\"]"
  );
  process.exit(1);
}

initializeApp({
  credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? applicationDefault()
    : cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
});

await getAuth().setCustomUserClaims(uid, { role });

await getFirestore()
  .collection("users")
  .doc(uid)
  .set(
    {
      uid,
      email,
      role,
      active: true,
      ...(name ? { name } : {}),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

console.log(`✅ ${email} (${uid}) is now '${role}'.`);
process.exit(0);

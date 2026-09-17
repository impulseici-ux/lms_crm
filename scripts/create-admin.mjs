// One-off helper: creates a brand-new Firebase Auth user AND grants them the
// admin role in one step, using a service-account key. Useful for the very
// first admin on a fresh project, where no Auth user exists yet at all.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/create-admin.mjs <email> <password> "<Display Name>"
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const [, , email, password, displayName] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.mjs <email> <password> ["Display Name"]');
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your downloaded service-account.json before running this.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });

async function main() {
  const user = await getAuth().createUser({
    email,
    password,
    displayName: displayName || email,
  });

  await getAuth().setCustomUserClaims(user.uid, { role: "admin" });

  await getFirestore().collection("users").doc(user.uid).set({
    displayName: displayName || email,
    email,
    role: "admin",
    branchId: null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`Created admin user ${email} (uid: ${user.uid}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

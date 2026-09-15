// One-time bootstrap for a REAL (non-emulator) Firebase project: grants the
// first admin their role. Every other role change after this should go
// through the app's Admin → Staff screen (the setUserRole Cloud Function),
// which requires an existing admin to call it — this script exists purely
// to break that chicken-and-egg problem once, right after go-live.
//
// Usage:
//   1. Firebase Console → Project settings → Service accounts →
//      "Generate new private key" → save as service-account.json
//      (do NOT commit this file — it's already covered by .gitignore's *.json exclusion below? — see note)
//   2. Create the user's account in Firebase Console → Authentication → Add user
//      (or have them sign up however your project allows), and copy their UID.
//   3. Run:
//        GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//        node scripts/bootstrap-admin.mjs <uid> <email> "<Display Name>"
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const [, , uid, email, displayName] = process.argv;

if (!uid || !email) {
  console.error('Usage: node scripts/bootstrap-admin.mjs <uid> <email> ["Display Name"]');
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
  console.error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to your downloaded service-account.json before running this."
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });

async function main() {
  await getAuth().setCustomUserClaims(uid, { role: "admin" });
  await getFirestore().collection("users").doc(uid).set(
    {
      displayName: displayName || email,
      email,
      role: "admin",
      branchId: null,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`${email} (${uid}) is now an admin. They must sign out and back in for the new role to take effect.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Grants a staff member their role on a REAL (non-emulator) Firebase project,
// by writing the Auth custom claim and the mirrored users/{uid} doc directly
// via firebase-admin.
//
// On a project with Cloud Functions deployed (Blaze plan), this is normally
// done from the app's Admin → Staff screen (the setUserRole callable), which
// requires an existing admin to be signed in. On the Spark (free) plan —
// where Cloud Functions can't be deployed at all — this script IS the role
// management flow: run it for every staff member, not just the first admin.
//
// Usage:
//   1. Firebase Console → Project settings → Service accounts →
//      "Generate new private key" → save as service-account.json in the
//      repo root (git-ignored — never commit it).
//   2. Firebase Console → Authentication → Add user → copy their UID.
//   3. Run:
//        GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//        node scripts/set-role.mjs <uid> <email> <admin|counsellor|management> ["Display Name"]
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// superadmin is a tier above admin, reserved for permanent user deletion (backend's
// /api/delete-user) — deliberately not offered anywhere in the Admin UI, only grantable
// by someone with direct service-account access via this script.
const VALID_ROLES = ["admin", "counsellor", "management", "superadmin"];
const [, , uid, email, role, displayName] = process.argv;

if (!uid || !email || !role || !VALID_ROLES.includes(role)) {
  console.error(
    `Usage: node scripts/set-role.mjs <uid> <email> <${VALID_ROLES.join("|")}> ["Display Name"]`
  );
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
  await getAuth().setCustomUserClaims(uid, { role });
  await getFirestore().collection("users").doc(uid).set(
    {
      displayName: displayName || email,
      email,
      role,
      branchId: null,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`${email} (${uid}) is now ${role}. They must sign out and back in for the new role to take effect.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

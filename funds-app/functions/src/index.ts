import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

initializeApp();

type Role = "manager" | "employee";

function assertManager(authToken: { role?: string } | undefined): void {
  if (!authToken || authToken.role !== "manager") {
    throw new HttpsError("permission-denied", "Only a manager can do this.");
  }
}

/**
 * Manager-only: promote/demote an existing staff member's role.
 */
export const setUserRole = onCall(async (request) => {
  assertManager(request.auth?.token as { role?: string } | undefined);

  const { uid, role } = request.data as { uid?: string; role?: Role };
  if (!uid || (role !== "manager" && role !== "employee")) {
    throw new HttpsError("invalid-argument", "uid and role ('manager'|'employee') are required.");
  }

  await getAuth().setCustomUserClaims(uid, { role });
  await getFirestore().collection("users").doc(uid).set({ role }, { merge: true });

  return { ok: true };
});

/**
 * Manager-only: create a brand-new employee (Auth user + Firestore profile
 * + custom claim) in one call, so managers never need console/CLI access.
 */
export const createEmployee = onCall(async (request) => {
  assertManager(request.auth?.token as { role?: string } | undefined);

  const { name, email, password, role } = request.data as {
    name?: string;
    email?: string;
    password?: string;
    role?: Role;
  };

  if (!name || !email || !password || password.length < 6) {
    throw new HttpsError(
      "invalid-argument",
      "name, email and a password of at least 6 characters are required."
    );
  }
  const finalRole: Role = role === "manager" ? "manager" : "employee";

  const userRecord = await getAuth().createUser({
    email,
    password,
    displayName: name,
  });

  await getAuth().setCustomUserClaims(userRecord.uid, { role: finalRole });

  await getFirestore()
    .collection("users")
    .doc(userRecord.uid)
    .set({
      uid: userRecord.uid,
      name,
      email,
      role: finalRole,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });

  return { ok: true, uid: userRecord.uid };
});

/**
 * Manager-only: deactivate/reactivate an employee (keeps their historical
 * transactions intact; just hides them from "active" lists and, for
 * deactivation, disables their Auth account).
 */
export const setEmployeeActive = onCall(async (request) => {
  assertManager(request.auth?.token as { role?: string } | undefined);

  const { uid, active } = request.data as { uid?: string; active?: boolean };
  if (!uid || typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "uid and active (boolean) are required.");
  }

  await getAuth().updateUser(uid, { disabled: !active });
  await getFirestore().collection("users").doc(uid).set({ active }, { merge: true });

  return { ok: true };
});

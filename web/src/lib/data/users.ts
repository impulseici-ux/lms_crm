import { onSnapshot, query, orderBy, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { usersCol } from "@/lib/data/collections";
import { functions, db, createIsolatedAuthApp } from "@/lib/firebase";
import type { Role, UserDoc } from "@/types";

const STAFF_EMAIL_DOMAIN = "littlemillennium.local";

export function subscribeUsers(onChange: (users: UserDoc[]) => void) {
  return onSnapshot(query(usersCol(), orderBy("displayName", "asc")), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserDoc, "id">) })));
  });
}

const setUserRoleCallable = httpsCallable<
  { uid: string; role: Role; displayName?: string; branchId?: string | null; active?: boolean },
  { ok: true }
>(functions, "setUserRole");

/** Admin-only — Section 18: role changes only happen through this callable, never a direct Firestore write. */
export async function setUserRole(input: {
  uid: string;
  role: Role;
  displayName?: string;
  branchId?: string | null;
  active?: boolean;
}) {
  await setUserRoleCallable(input);
}

export interface CreateStaffUserInput {
  username: string;
  password: string;
  role: Role;
  displayName: string;
  branchId?: string | null;
}

export interface CreateStaffUserResult {
  uid: string;
  email: string;
  /** Copy-pasteable command that actually grants the role — see createStaffUser's doc comment. */
  activationCommand: string;
}

/**
 * Self-service "Create User" (Admin → Staff), matching the one-step flow of
 * other internal tools instead of "create the account in Firebase Console,
 * then paste its UID here". Creates the Auth login and the users/{uid}
 * profile doc directly from the browser — no Blaze plan needed for that part.
 *
 * What this does NOT do: grant the actual permission. Firestore rules only
 * trust the `role` custom claim on the ID token (Section 18) — a browser can
 * never set that for any account, including one it just created, because
 * that would let any signed-in client grant itself admin. Setting the claim
 * requires the privileged Admin SDK, which on the free Spark plan (no Cloud
 * Functions) means running scripts/set-role.mjs once — the command below is
 * generated ready to paste so that's the only manual step left.
 */
export async function createStaffUser(input: CreateStaffUserInput): Promise<CreateStaffUserResult> {
  const email = input.username.includes("@") ? input.username.trim() : `${input.username.trim()}@${STAFF_EMAIL_DOMAIN}`;
  const displayName = input.displayName.trim() || email;

  const { auth: isolatedAuth, cleanup } = createIsolatedAuthApp();
  try {
    const credential = await createUserWithEmailAndPassword(isolatedAuth, email, input.password);
    const uid = credential.user.uid;
    await signOut(isolatedAuth);

    // Written from the ADMIN's real session (Firestore rules: users/{uid}
    // create/update requires isAdmin()) — this `role` field is informational
    // display data only, per firestore.rules' own comment on this collection.
    await setDoc(doc(db, "users", uid), {
      displayName,
      email,
      role: input.role,
      branchId: input.branchId ?? null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const activationCommand = `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/set-role.mjs ${uid} ${email} ${input.role} "${displayName}"`;
    return { uid, email, activationCommand };
  } finally {
    await cleanup();
  }
}

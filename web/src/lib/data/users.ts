import { onSnapshot, query, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { usersCol } from "@/lib/data/collections";
import { functions } from "@/lib/firebase";
import type { Role, UserDoc } from "@/types";

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

import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebaseAdmin";

/** Writes one entry to the superadmin-only Admin > Audit Log (Firestore `auditLog`
 * collection). Uses the Admin SDK, so it bypasses firestore.rules — the only client
 * write path into this collection is the lead-deletion one in web/src/lib/data/leads.ts. */
export async function logAudit(entry: {
  type: "user_invited" | "user_activated" | "user_deactivated" | "user_deleted" | "role_switch_used" | "user_updated";
  byStaffId: string;
  byDisplayName?: string | null;
  targetUserId?: string;
  targetDisplayName?: string;
  fromRole?: string;
  toRole?: string;
  details?: string;
}) {
  await db()
    .collection("auditLog")
    .add({ ...entry, at: FieldValue.serverTimestamp() });
}

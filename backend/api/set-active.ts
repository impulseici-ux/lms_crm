import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { applyCors } from "../lib/cors";
import { requireAdmin, HttpError } from "../lib/requireAdmin";
import { auth, db } from "../lib/firebaseAdmin";

// Admin-only. Disables the Firebase Auth credential itself (not just a Firestore flag) so
// a deactivated account genuinely can't sign in, not merely display as "Inactive" in the UI.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    await requireAdmin(req);
    const { uid, active } = req.body ?? {};
    if (!uid || typeof active !== "boolean") throw new HttpError(400, "uid and active (boolean) are required.");

    const userRef = db().collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpError(404, "User not found.");
    const currentStatus = userSnap.data()!.status;

    await auth().updateUser(uid, { disabled: !active });
    await userRef.update({
      active,
      // Only override status for accounts that were already fully onboarded — never
      // silently move a pending/password-setup account into "active".
      status: active ? (currentStatus === "inactive" ? "active" : currentStatus) : "inactive",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error("set-active error:", err);
    return res.status(500).json({ error: "Something went wrong updating this account." });
  }
}

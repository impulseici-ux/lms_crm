import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../lib/cors";
import { requireSuperAdmin, HttpError } from "../lib/requireAdmin";
import { auth, db } from "../lib/firebaseAdmin";

// Superadmin-only (stricter than the rest of this backend, which only requires admin/superadmin).
// Permanently removes the Firebase Auth credential and every Firestore trace of the account —
// unlike set-active's deactivation, this cannot be undone.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const { uid: callerUid } = await requireSuperAdmin(req);
    const { uid } = req.body ?? {};
    if (!uid) throw new HttpError(400, "uid is required.");
    if (uid === callerUid) throw new HttpError(400, "You cannot delete your own account.");

    const userSnap = await db().collection("users").doc(uid).get();
    if (!userSnap.exists) throw new HttpError(404, "User not found.");

    await auth()
      .deleteUser(uid)
      .catch((err) => {
        // Already gone from Auth (e.g. a retry after a partial earlier failure) — still
        // proceed to clean up Firestore rather than leaving an orphaned profile behind.
        if (err?.code !== "auth/user-not-found") throw err;
      });

    const batch = db().batch();
    batch.delete(db().collection("users").doc(uid));
    batch.delete(db().collection("userActivations").doc(uid));
    await batch.commit();

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error("delete-user error:", err);
    return res.status(500).json({ error: "Something went wrong deleting this account." });
  }
}

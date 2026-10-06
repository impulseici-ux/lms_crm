import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../lib/cors";
import { HttpError } from "../lib/requireAdmin";
import { auth, db } from "../lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

const VALID_ROLES = ["admin", "counsellor", "management", "superadmin"] as const;
type Role = (typeof VALID_ROLES)[number];

// Lets a small, explicitly-granted set of accounts (users/{uid}.canSwitchRoles === true,
// set only via the Admin SDK — never writable from the client, see firestore.rules) flip
// their OWN custom claim + Firestore role between the four roles, to test real permission
// behavior without juggling separate test logins. Deliberately does NOT require the
// caller's *current* role to be superadmin (unlike requireAdmin/requireSuperAdmin) — once
// someone switches down to e.g. "counsellor" they'd otherwise be locked out of switching
// back. The persistent `canSwitchRoles` grant (checked fresh from Firestore every call) is
// what gates this, not the live, mutable role claim.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) throw new HttpError(401, "Missing Authorization header.");
    const decoded = await auth()
      .verifyIdToken(idToken)
      .catch(() => {
        throw new HttpError(401, "Invalid or expired session.");
      });

    const { role } = (req.body ?? {}) as { role?: string };
    if (!role || !VALID_ROLES.includes(role as Role)) {
      throw new HttpError(400, `role must be one of: ${VALID_ROLES.join(", ")}.`);
    }

    const userSnap = await db().collection("users").doc(decoded.uid).get();
    const userData = userSnap.data();
    if (!userSnap.exists || userData?.canSwitchRoles !== true) {
      throw new HttpError(403, "Role switching isn't enabled for this account.");
    }

    await auth().setCustomUserClaims(decoded.uid, { role });
    await db()
      .collection("users")
      .doc(decoded.uid)
      .set({ role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    return res.status(200).json({ ok: true, role });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error("switch-role error:", err);
    return res.status(500).json({ error: "Something went wrong switching roles." });
  }
}

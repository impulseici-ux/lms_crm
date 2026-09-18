import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { applyCors } from "../lib/cors";
import { HttpError } from "../lib/requireAdmin";
import { auth, db } from "../lib/firebaseAdmin";
import { hashActivationCode } from "../lib/activation";

// Public endpoint, reached only after /api/verify-code has already flipped this user to
// password_setup_required. This is the ONLY place a password is ever set for a new user —
// never by an admin, never anywhere else — and the ONLY place status becomes "active".
// Per Part 9: activation-code verification alone must never be enough; both steps are
// required, and they're enforced here by re-checking status server-side rather than
// trusting anything the client claims about where it is in the flow.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const { uid, password, confirmPassword } = req.body ?? {};
    if (!uid || !password || !confirmPassword) {
      throw new HttpError(400, "Password and confirm password are required.");
    }
    if (password !== confirmPassword) throw new HttpError(400, "Passwords don't match.");
    if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");

    const userRef = db().collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpError(404, "Account not found.");
    const user = userSnap.data()!;

    if (user.status !== "password_setup_required") {
      throw new HttpError(409, "This account is not ready for password setup. Verify your activation code first.");
    }

    // Part 8: the activation code itself can't become the password.
    const activationSnap = await db().collection("userActivations").doc(uid).get();
    const codeHash = activationSnap.data()?.codeHash;
    if (codeHash && hashActivationCode(password, uid) === codeHash) {
      throw new HttpError(400, "Your password can't be the same as the activation code.");
    }

    // Firebase Admin SDK hashes and stores this securely — this codebase never sees or
    // stores a plaintext or independently-hashed password anywhere else.
    await auth().updateUser(uid, { password });
    await auth().setCustomUserClaims(uid, { role: user.role });

    await userRef.update({
      status: "active",
      passwordSetupCompleted: true,
      activatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error("set-password error:", err);
    return res.status(500).json({ error: "Something went wrong setting your password. Please try again." });
  }
}

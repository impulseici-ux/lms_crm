import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../lib/cors";
import { requireAdmin, HttpError } from "../lib/requireAdmin";
import { db } from "../lib/firebaseAdmin";
import { RESEND_COOLDOWN_SECONDS } from "../lib/activation";
import { issueActivationCode } from "../lib/issueCode";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    await requireAdmin(req);

    const { uid } = req.body ?? {};
    if (!uid) throw new HttpError(400, "uid is required.");

    const userSnap = await db().collection("users").doc(uid).get();
    if (!userSnap.exists) throw new HttpError(404, "User not found.");
    const user = userSnap.data()!;

    if (user.status !== "pending_activation") {
      // Part 12: once the code has already been verified, don't generate another —
      // the user has moved on to password setup (or is already active).
      throw new HttpError(409, "This user has already verified their activation code — nothing to resend.");
    }

    const activationSnap = await db().collection("userActivations").doc(uid).get();
    const lastSentAt = activationSnap.data()?.lastSentAt?.toDate?.();
    if (lastSentAt && Date.now() - lastSentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - lastSentAt.getTime())) / 1000);
      throw new HttpError(429, `Please wait ${waitSeconds}s before requesting another code.`);
    }

    const result = await issueActivationCode(uid, user.mobile, user.displayName);
    return res.status(200).json({ ok: true, uid, mobile: user.mobile, displayName: user.displayName, loginId: user.loginId, ...result });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error("resend-code error:", err);
    return res.status(500).json({ error: "Unable to send the activation code through WhatsApp right now. Please try again." });
  }
}

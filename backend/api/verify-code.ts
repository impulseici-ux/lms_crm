import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { applyCors } from "../lib/cors";
import { HttpError } from "../lib/requireAdmin";
import { db } from "../lib/firebaseAdmin";
import { normalizeMobile, hashActivationCode, MAX_VERIFY_ATTEMPTS } from "../lib/activation";

const GENERIC_ERROR = "Invalid mobile number or code.";

// Public endpoint — the user has no Firebase session yet at this step (Part 6/10:
// verifying the code must never itself grant CRM access). Security comes from
// requiring the correct mobile+code pair, rate-limited attempts, and a short expiry,
// not from an auth token.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const { mobile, code } = req.body ?? {};
    if (!mobile?.trim() || !code?.trim()) throw new HttpError(400, GENERIC_ERROR);

    const normalizedMobile = normalizeMobile(mobile);
    const userSnap = await db()
      .collection("users")
      .where("mobile", "==", normalizedMobile)
      .where("status", "==", "pending_activation")
      .limit(1)
      .get();

    if (userSnap.empty) throw new HttpError(400, GENERIC_ERROR);
    const userDoc = userSnap.docs[0];
    const uid = userDoc.id;

    const activationRef = db().collection("userActivations").doc(uid);
    const activationSnap = await activationRef.get();
    if (!activationSnap.exists) throw new HttpError(400, GENERIC_ERROR);
    const activation = activationSnap.data()!;

    if (activation.verified) throw new HttpError(400, "This code has already been used.");
    if (activation.verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
      throw new HttpError(429, "Too many incorrect attempts. Ask your admin to resend the code.");
    }
    const expiresAt = activation.expiresAt?.toDate?.();
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "This code has expired. Ask your admin to resend it.");
    }

    const candidateHash = hashActivationCode(code.trim(), uid);
    if (candidateHash !== activation.codeHash) {
      await activationRef.update({ verifyAttempts: FieldValue.increment(1) });
      throw new HttpError(400, GENERIC_ERROR);
    }

    await activationRef.update({ verified: true, verifiedAt: FieldValue.serverTimestamp() });
    await db().collection("users").doc(uid).update({ status: "password_setup_required", updatedAt: FieldValue.serverTimestamp() });

    return res.status(200).json({ ok: true, uid });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error("verify-code error:", err);
    return res.status(500).json({ error: "Something went wrong verifying this code. Please try again." });
  }
}

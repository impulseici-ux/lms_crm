import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { applyCors } from "../lib/cors";
import { requireAdmin, HttpError } from "../lib/requireAdmin";
import { auth, db } from "../lib/firebaseAdmin";
import { normalizeMobile, isValidMobile, slugifyForEmail } from "../lib/activation";
import { issueActivationCode } from "../lib/issueCode";

const VALID_ROLES = ["admin", "counsellor", "management"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const { uid: callerUid } = await requireAdmin(req);

    const { fullName, mobile, role, branchId } = req.body ?? {};
    if (!fullName?.trim() || !mobile?.trim() || !VALID_ROLES.includes(role)) {
      throw new HttpError(400, "Full name, mobile number, and a valid role are required.");
    }

    const normalizedMobile = normalizeMobile(mobile);
    if (!isValidMobile(normalizedMobile)) {
      throw new HttpError(400, "The WhatsApp number appears to be invalid. Please verify the number and try again.");
    }

    // Duplicate-mobile handling (Part 23): never create a second user for a number that
    // already has one, in any status.
    const existingSnap = await db().collection("users").where("mobile", "==", normalizedMobile).limit(1).get();
    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0];
      const status = existing.data().status;
      if (status === "active") {
        throw new HttpError(409, "This mobile number already belongs to an active account.");
      }
      if (status === "inactive") {
        throw new HttpError(409, "This mobile number belongs to a disabled account. Reactivate it instead of creating a new one.");
      }
      if (status === "password_setup_required") {
        throw new HttpError(409, "This user has already verified their activation code and is completing password setup.");
      }
      // pending_activation: this is effectively a resend for the SAME existing user, not a new one.
      const result = await issueActivationCode(existing.id, normalizedMobile, existing.data().displayName ?? fullName);
      return res.status(200).json({ ok: true, uid: existing.id, email: existing.data().email, resumedExisting: true, ...result });
    }

    // No existing account for this number — create a brand-new one. No password is ever
    // set here (Part 1/2): the Auth user has an email identity but no password credential
    // until the user completes their own password setup, so it cannot sign in until then.
    const baseSlug = slugifyForEmail(fullName);
    let email = `${baseSlug}@littlemillennium.local`;
    let suffix = 0;
    while (true) {
      const taken = await auth()
        .getUserByEmail(email)
        .then(() => true)
        .catch(() => false);
      if (!taken) break;
      suffix += 1;
      email = `${baseSlug}${suffix}@littlemillennium.local`;
    }

    const userRecord = await auth().createUser({ email, displayName: fullName.trim() });

    await db().collection("users").doc(userRecord.uid).set({
      displayName: fullName.trim(),
      email,
      mobile: normalizedMobile,
      role,
      branchId: branchId || null,
      status: "pending_activation",
      passwordSetupCompleted: false,
      active: true,
      invitedByStaffId: callerUid,
      activatedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const result = await issueActivationCode(userRecord.uid, normalizedMobile, fullName.trim());
    return res.status(200).json({ ok: true, uid: userRecord.uid, email, resumedExisting: false, ...result });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error("invite error:", err);
    return res.status(500).json({ error: "Something went wrong creating this user. Please try again." });
  }
}

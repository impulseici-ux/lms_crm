import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebaseAdmin";
import { generateActivationCode, hashActivationCode, ACTIVATION_CODE_TTL_MINUTES } from "./activation";
import { sendActivationCodeWhatsApp } from "./whatsapp";

export interface IssueCodeResult {
  whatsappStatus: string;
  whatsappError?: string;
  /** Only present when WhatsApp delivery did not succeed — the one intentional exception to
   * "never expose the code": with no working delivery channel yet, this is the only way an
   * admin can hand it to the user at all. Never logged, never written to Firestore in plaintext. */
  fallbackCode?: string;
}

/** Shared by /api/invite (new user) and /api/resend-code (existing pending user): generates a
 * fresh code, invalidates whatever code existed before, and attempts WhatsApp delivery. */
export async function issueActivationCode(uid: string, mobile: string, displayName: string): Promise<IssueCodeResult> {
  const code = generateActivationCode();
  const codeHash = hashActivationCode(code, uid);
  const expiresAt = new Date(Date.now() + ACTIVATION_CODE_TTL_MINUTES * 60 * 1000);

  await db().collection("userActivations").doc(uid).set(
    {
      uid,
      mobile,
      codeHash,
      expiresAt,
      verified: false,
      verifiedAt: null,
      verifyAttempts: 0,
      whatsappStatus: "sending",
      whatsappError: null,
      lastSentAt: FieldValue.serverTimestamp(),
      resendCount: FieldValue.increment(1),
    },
    { merge: true }
  );

  const sendResult = await sendActivationCodeWhatsApp(mobile, code, displayName);

  await db().collection("userActivations").doc(uid).update({
    whatsappStatus: sendResult.status,
    whatsappError: sendResult.error ?? null,
  });

  return {
    whatsappStatus: sendResult.status,
    whatsappError: sendResult.error,
    fallbackCode: sendResult.ok ? undefined : code,
  };
}

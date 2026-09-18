export type WhatsappStatus = "not_sent" | "sending" | "sent" | "failed" | "delivered" | "read";

export interface WhatsappSendResult {
  ok: boolean;
  status: WhatsappStatus;
  /** Admin-friendly, never a raw provider error/token/credential. */
  error?: string;
}

/**
 * No WhatsApp Business API provider is configured yet (Meta Cloud API,
 * Twilio, Gupshup, etc. — see backend/README.md). This always reports
 * failure so the rest of the activation flow's failure-handling path is
 * exercised for real, rather than silently pretending to succeed.
 *
 * To wire in a real provider: replace this function's body with the
 * provider's send call, read its credentials from environment variables
 * (never hard-code them), and map its response to WhatsappSendResult —
 * every other file in this flow (invite/resend endpoints, Firestore
 * schema, the Admin UI's status column) already expects exactly this shape
 * and needs no other change.
 */
export async function sendActivationCodeWhatsApp(_mobile: string, _code: string, _displayName: string): Promise<WhatsappSendResult> {
  const hasProvider = Boolean(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN);
  if (!hasProvider) {
    return {
      ok: false,
      status: "failed",
      error: "WhatsApp messaging is not configured yet. Share the activation code with the user another way for now.",
    };
  }
  // Placeholder for the real provider call — intentionally not implemented
  // until a provider is chosen and its credentials are set as environment
  // variables (WHATSAPP_API_URL, WHATSAPP_API_TOKEN, template name, etc).
  return {
    ok: false,
    status: "failed",
    error: "WhatsApp provider configuration found, but sending is not implemented yet.",
  };
}

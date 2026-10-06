import { isValidLeadPhone, normalizeLeadPhone } from "@/utils/phone";
import type { WhatsAppProviderName } from "@/types/whatsapp";

// ---------------------------------------------------------------------------
// Provider abstraction (Section 1/21/28 of the WhatsApp Automation spec).
//
// Nothing outside this file — not the automation engine, not the UI — may
// know how a message actually gets delivered. Today VITE_WHATSAPP_PROVIDER
// is unset (or "development"), so every call resolves to
// DevelopmentWhatsAppProvider, which never makes a network call and always
// reports SIMULATED. Connecting a real account later means implementing
// MetaWhatsAppProvider below and flipping the env var — nothing else in the
// CRM changes.
// ---------------------------------------------------------------------------

export interface ProviderSendResult {
  ok: boolean;
  status: "simulated" | "sent" | "failed";
  providerMessageId: string | null;
  error: string | null;
}

export interface ProviderStatusResult {
  status: "sent" | "delivered" | "read" | "failed" | "unknown";
}

export interface ProviderValidateResult {
  valid: boolean;
  normalized: string | null;
}

export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  sendTextMessage(to: string, body: string): Promise<ProviderSendResult>;
  sendTemplateMessage(to: string, templateName: string, body: string, variables: Record<string, string>): Promise<ProviderSendResult>;
  getMessageStatus(providerMessageId: string): Promise<ProviderStatusResult>;
  validateNumber(phone: string): Promise<ProviderValidateResult>;
}

// ---- Development / Simulation provider — the only one active today ----
export class DevelopmentWhatsAppProvider implements WhatsAppProvider {
  readonly name: WhatsAppProviderName = "development";

  async sendTextMessage(_to: string, _body: string): Promise<ProviderSendResult> {
    // Deliberately no network call. Development Mode never claims a message
    // was actually sent — see Section 2/8 of the spec.
    return { ok: true, status: "simulated", providerMessageId: null, error: null };
  }

  async sendTemplateMessage(
    _to: string,
    _templateName: string,
    _body: string,
    _variables: Record<string, string>
  ): Promise<ProviderSendResult> {
    return { ok: true, status: "simulated", providerMessageId: null, error: null };
  }

  async getMessageStatus(_providerMessageId: string): Promise<ProviderStatusResult> {
    return { status: "unknown" };
  }

  async validateNumber(phone: string): Promise<ProviderValidateResult> {
    const { value, valid } = normalizeLeadPhone(phone);
    return { valid: valid && isValidLeadPhone(value), normalized: valid ? value : null };
  }
}

// ---- Future Meta WhatsApp Cloud API provider — NOT implemented yet ----
// Intentionally a stub: the business account isn't enabled, so there is
// nothing to call. This class exists only to prove the interface is enough
// to add a real provider without touching the engine or UI. When the time
// comes: read the access token from a server-side secret (never the
// frontend, never localStorage — Section 27), call the Graph API, and map
// its response into ProviderSendResult/ProviderStatusResult.
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name: WhatsAppProviderName = "meta";

  async sendTextMessage(): Promise<ProviderSendResult> {
    throw new Error("Meta WhatsApp Cloud API is not connected yet.");
  }

  async sendTemplateMessage(): Promise<ProviderSendResult> {
    throw new Error("Meta WhatsApp Cloud API is not connected yet.");
  }

  async getMessageStatus(): Promise<ProviderStatusResult> {
    throw new Error("Meta WhatsApp Cloud API is not connected yet.");
  }

  async validateNumber(): Promise<ProviderValidateResult> {
    throw new Error("Meta WhatsApp Cloud API is not connected yet.");
  }
}

let cachedProvider: WhatsAppProvider | null = null;

export function getWhatsAppProviderName(): WhatsAppProviderName {
  const configured = (import.meta.env.VITE_WHATSAPP_PROVIDER as string | undefined)?.trim().toLowerCase();
  return configured === "meta" ? "meta" : "development";
}

// The one place the rest of the app is allowed to ask "which provider is active".
// Everything else calls through this — see engine.ts.
export function getWhatsAppProvider(): WhatsAppProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = getWhatsAppProviderName() === "meta" ? new MetaWhatsAppProvider() : new DevelopmentWhatsAppProvider();
  return cachedProvider;
}

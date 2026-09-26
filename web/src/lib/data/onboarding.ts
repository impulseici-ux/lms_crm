import { auth } from "@/lib/firebase";
import type { Role } from "@/types";

/**
 * The activation backend's base URL (see /backend in the repo — a Vercel
 * deployment, since Cloud Functions can't run on this project's free Spark
 * plan). Configured per-environment via VITE_BACKEND_URL.
 */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string | undefined;

/** Must match backend/lib/activation.ts's LOGIN_ID_DOMAIN — Firebase Auth has no native username concept, so a Login ID maps 1:1 to `<id>@LOGIN_ID_DOMAIN` internally. */
export const LOGIN_ID_DOMAIN = "littlemillennium.local";

export function loginIdToEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@${LOGIN_ID_DOMAIN}`;
}

export interface IssueCodeResult {
  ok: true;
  uid: string;
  loginId?: string;
  mobile?: string;
  displayName?: string;
  resumedExisting?: boolean;
  whatsappStatus: "not_sent" | "sending" | "sent" | "failed" | "delivered" | "read";
  whatsappError?: string;
  /** Only present while no WhatsApp provider is configured — see backend/lib/whatsapp.ts. */
  fallbackCode?: string;
}

async function callBackend<T>(path: string, body: unknown, requireAuth: boolean): Promise<T> {
  if (!BACKEND_URL) {
    throw new Error("The activation backend isn't configured yet (VITE_BACKEND_URL is unset).");
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (requireAuth) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("You must be signed in to do this.");
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BACKEND_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status}).`);
  }
  return json as T;
}

/** Admin-only. Creates the new user (or resumes an existing pending one for the same mobile number) and attempts to send the activation code. */
export function inviteUser(input: { fullName: string; mobile: string; loginId: string; role: Role; branchId?: string | null }) {
  return callBackend<IssueCodeResult>("/api/invite", input, true);
}

/** Admin-only. Only valid while the user is still Pending Activation. */
export function resendActivationCode(uid: string) {
  return callBackend<IssueCodeResult>("/api/resend-code", { uid }, true);
}

/** Public — the user has no CRM session at this point. Moves the account to Password Setup Required on success; never grants CRM access by itself. */
export function verifyActivationCode(mobile: string, code: string) {
  return callBackend<{ ok: true; uid: string }>("/api/verify-code", { mobile, code }, false);
}

/** Public — only succeeds if the account already completed code verification. This is the only place a password is ever set, and the only place status becomes Active. */
export function setNewPassword(uid: string, password: string, confirmPassword: string) {
  return callBackend<{ ok: true }>("/api/set-password", { uid, password, confirmPassword }, false);
}

/** Admin-only. Also disables/enables the underlying Firebase Auth credential, not just a display flag. */
export function setUserActive(uid: string, active: boolean) {
  return callBackend<{ ok: true }>("/api/set-active", { uid, active }, true);
}

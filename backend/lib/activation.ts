import { randomInt, createHash } from "node:crypto";

export const ACTIVATION_CODE_TTL_MINUTES = 30;
export const MAX_VERIFY_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

/** 6-digit numeric code, e.g. "583921". Never logged, never stored in plaintext. */
export function generateActivationCode(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Hashed with the uid folded in (so the same code for two different users
 * never produces the same hash) plus an optional server-only pepper, so a
 * Firestore-only read can't be used to brute-force codes offline without
 * also having this deployment's environment variable.
 */
export function hashActivationCode(code: string, uid: string): string {
  const pepper = process.env.ACTIVATION_CODE_PEPPER ?? "";
  return createHash("sha256").update(`${code}:${uid}:${pepper}`).digest("hex");
}

/** Normalizes to a consistent E.164-ish key so lookups/dedup by mobile are reliable. Defaults to India (+91) for a bare 10-digit number, matching this school's locale. */
export function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export function isValidMobile(normalized: string): boolean {
  return /^\+\d{10,15}$/.test(normalized);
}

/** Firebase Auth has no native username concept, so a Login ID becomes `<id>@LOGIN_ID_DOMAIN` internally — never shown to the user. */
export const LOGIN_ID_DOMAIN = "littlemillennium.local";

export function isValidLoginId(loginId: string): boolean {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(loginId);
}

export function loginIdToEmail(loginId: string): string {
  return `${loginId.toLowerCase()}@${LOGIN_ID_DOMAIN}`;
}

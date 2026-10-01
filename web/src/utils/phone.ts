/** Normalizes an Indian mobile number for duplicate-detection comparisons (strips formatting, drops a leading +91/91). */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
}

export interface NormalizedPhone {
  /** Best-effort canonical value — "+91XXXXXXXXXX" for Indian numbers, "+<digits>" for other
   *  recognizable international numbers, or the original trimmed input when it can't be
   *  reliably parsed (never fabricated into a fake-looking number). */
  value: string;
  valid: boolean;
}

/**
 * Canonical normalizer for a lead's phone number, used once at the data-write layer
 * (lib/data/leads.ts) so every ingestion path — manual entry, CSV import, Google Sheets
 * sync — stores the same clean shape. Strips stray prefixes like "P:", "P:+91" and
 * formatting noise (spaces, hyphens, brackets, duplicate +), without blindly forcing a
 * +91 country code onto a number that already looks like a different country's.
 */
export function normalizeLeadPhone(raw: string): NormalizedPhone {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: "", valid: false };

  const hasPlus = trimmed.includes("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return { value: trimmed, valid: false };

  // Exactly 10 digits — a bare Indian mobile number missing its country code, even if a
  // stray "+" was typed in front of it (e.g. "P:+9841234567"): there's no valid country
  // code that's itself empty, so this is still "91 plus these 10 digits", not a foreign number.
  if (digits.length === 10) {
    return { value: `+91${digits}`, valid: true };
  }
  // 12 digits starting with 91 — Indian number with country code, "+" typed or not.
  if (digits.length === 12 && digits.startsWith("91")) {
    return { value: `+${digits}`, valid: true };
  }
  // A "+" was typed and what's left looks like a plausible international number —
  // preserve its actual country code rather than overwriting it with +91.
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return { value: `+${digits}`, valid: true };
  }

  // Can't reliably parse this (e.g. "P:+91" with no real number after it) — keep the
  // original value as-is and flag it invalid, rather than guessing.
  return { value: trimmed, valid: false };
}

/** Pure function of a stored phone value — also correctly flags legacy malformed records written before normalization existed, with no migration required. */
export function isValidLeadPhone(value: string | null | undefined): boolean {
  return !!value && /^\+\d{10,15}$/.test(value);
}

/** Consistent display format used throughout the CRM: "+91XXXXXXXXXX", with no normalization attempted at render time (that happens once, at write time). */
export function formatLeadPhone(value: string | null | undefined): string {
  return value ?? "—";
}

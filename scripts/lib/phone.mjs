// Mirrors web/src/utils/phone.ts's normalizeLeadPhone — kept as a separate copy
// since this script runs as plain Node (not bundled with the Vite/TS frontend).
// Any change here should be mirrored there, and vice versa.

/**
 * Canonical normalizer for a lead's phone number. Strips stray prefixes like
 * "P:", "P:+91" and formatting noise (spaces, hyphens, brackets, duplicate +),
 * without blindly forcing a +91 country code onto a number that already looks
 * like a different country's. Returns the original trimmed value, flagged
 * invalid, when it can't be reliably parsed — never fabricates a fake number.
 */
export function normalizeLeadPhone(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { value: "", valid: false };

  const hasPlus = trimmed.includes("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return { value: trimmed, valid: false };

  if (digits.length === 10) {
    return { value: `+91${digits}`, valid: true };
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return { value: `+${digits}`, valid: true };
  }
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return { value: `+${digits}`, valid: true };
  }

  return { value: trimmed, valid: false };
}

export function isValidLeadPhone(value) {
  return !!value && /^\+\d{10,15}$/.test(value);
}

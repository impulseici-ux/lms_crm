/** Normalizes an Indian mobile number for duplicate-detection comparisons (strips formatting, drops a leading +91/91). */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
}

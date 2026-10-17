// Single source of truth for monetary display across the finance module (dashboard,
// registers, payroll, advances, reports, and CSV exports) — every amount is stored
// with full precision in Firestore but always shown to exactly 2 decimal places.
const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats a number as "₹1,234.50" for on-screen/print display. */
export function formatCurrency(amount: number): string {
  return inrFormatter.format(amount);
}

/** Formats a number as a plain "1234.50" for CSV/spreadsheet export (no symbol or thousands separator, so it stays machine-readable). */
export function formatAmountForCsv(amount: number): string {
  return amount.toFixed(2);
}

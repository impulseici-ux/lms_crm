// Pure-logic regression tests for the finance calculation rules approved for PR #18:
//   1. Monetary amounts display with exactly 2 decimal places everywhere.
//   2. (Covered in test-finance-rules.mjs, which has emulator access to real writes)
//   3. (Covered in test-finance-rules.mjs's dashboard-replication assertions)
//
// Runs the real web/src/lib/currency.ts module directly (via Node's native TypeScript
// support) rather than re-implementing the formatting logic, so this exercises the
// exact code the UI imports.
//
// Usage: node --experimental-strip-types scripts/test-finance-calculations.mjs

import { formatAmountForCsv, formatCurrency } from "../src/lib/currency.ts";

let passed = 0;
let failed = 0;

function expect(label, actual, expected) {
  if (actual === expected) {
    console.log(`[PASS] ${label}`);
    passed++;
  } else {
    console.log(`[FAIL] ${label} -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

// --- formatCurrency: always exactly 2 decimal places, regardless of input precision ---
expect("whole number gets .00", formatCurrency(500), "₹500.00");
expect("already-2-decimal value unchanged", formatCurrency(1234.5), "₹1,234.50");
expect("sub-paise input rounds to 2 decimals", formatCurrency(1234.567), "₹1,234.57");
expect("zero formats as 0.00", formatCurrency(0), "₹0.00");
expect("negative value keeps 2 decimals (e.g. a deficit reconciliation)", formatCurrency(-750), "-₹750.00");
expect("large value keeps thousands separators and 2 decimals", formatCurrency(1234567.8), "₹12,34,567.80");

// --- formatAmountForCsv: plain 2-decimal string, no currency symbol/thousands separator (CSV must stay machine-readable) ---
expect("CSV: whole number gets .00", formatAmountForCsv(500), "500.00");
expect("CSV: decimal value rounds to 2 places", formatAmountForCsv(1234.567), "1234.57");
expect("CSV: zero formats as 0.00", formatAmountForCsv(0), "0.00");
expect("CSV: no thousands separator (must stay a valid number literal)", formatAmountForCsv(1234567.8), "1234567.80");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

import type { Transaction } from "../types";

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function transactionsToCsv(transactions: Transaction[], includeEmployee = false): string {
  const headers = includeEmployee
    ? ["Date", "Employee", "Type", "Amount", "Note"]
    : ["Date", "Type", "Amount", "Note"];

  const rows = transactions.map((t) => {
    const cells = includeEmployee
      ? [t.date, t.employeeName, t.type, t.amount, t.note]
      : [t.date, t.type, t.amount, t.note];
    return cells.map(escapeCsvField).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadCsv(filename: string, csv: string): Promise<void> {
  const file = new File([csv], filename, { type: "text/csv" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch {
      // fall through to download if share was cancelled/unsupported
    }
  }
  downloadCsv(filename, csv);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function previousMonth(reference = new Date()): string {
  const d = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(reference = new Date()): string {
  return `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}`;
}

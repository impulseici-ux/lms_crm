export type Role = "manager" | "employee";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export type TransactionType = "received" | "spent";

export interface Transaction {
  id: string;
  employeeId: string;
  employeeName: string;
  type: TransactionType;
  amount: number;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  note: string;
  createdBy: string;
  createdAt?: unknown;
}

export type ReminderKind = "pay" | "receive";
export type ReminderRepeat = "once" | "monthly";

export interface Reminder {
  id: string;
  employeeId: string;
  title: string;
  kind: ReminderKind;
  amount: number | null;
  dueDate: string; // YYYY-MM-DD
  repeat: ReminderRepeat;
  note: string;
  completed: boolean;
  lastCompletedFor?: string; // YYYY-MM-DD, for monthly repeats
}

export interface MonthlyExportRecord {
  id: string; // `${employeeId}_${YYYY-MM}`
  employeeId: string;
  month: string;
  exported: boolean;
  exportedAt?: unknown;
  dismissedAt?: unknown;
}

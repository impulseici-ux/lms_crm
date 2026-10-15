import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, setDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type PaymentMode = "Cash" | "UPI" | "Bank Transfer" | "Card" | "Cheque";
export type FinanceKind = "income" | "expense";

export interface FinanceEntry {
  id: string;
  title: string;
  category: string;
  amount: number;
  transactionDate: string;
  accountingMonth: string;
  paymentMode: PaymentMode;
  reference?: string;
  notes?: string;
  paidBy?: string;
  createdBy: string;
  createdAt?: unknown;
  status: "posted" | "voided";
  linkedLeadId?: string | null;
  linkedPayrollPaymentId?: string | null;
  linkedSalaryAdvanceId?: string | null;
}

export interface SchoolStaff {
  id: string;
  name: string;
  roleTitle: string;
  mobile: string;
  monthlySalary: number;
  joiningDate: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PayrollPayment {
  id: string;
  staffId: string;
  staffName: string;
  accountingMonth: string;
  salaryAmount: number;
  deductions: number;
  advanceRecovery: number;
  netAmount: number;
  paymentMode: PaymentMode;
  transactionDate: string;
  expenseId: string;
  advanceId?: string | null;
  createdBy: string;
  createdAt?: unknown;
  status: "paid";
}

const incomeCollection = collection(db, "financeIncome");
const expenseCollection = collection(db, "financeExpenses");
const staffCollection = collection(db, "schoolStaff");
const payrollCollection = collection(db, "payrollPayments");

export async function listFinanceEntries(kind: FinanceKind): Promise<FinanceEntry[]> {
  const snap = await getDocs(query(kind === "income" ? incomeCollection : expenseCollection, orderBy("transactionDate", "desc")));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as FinanceEntry));
}

export async function addFinanceEntry(kind: FinanceKind, input: Omit<FinanceEntry, "id" | "createdAt" | "status" | "createdBy">, uid: string) {
  return addDoc(kind === "income" ? incomeCollection : expenseCollection, {
    ...input,
    createdBy: uid,
    status: "posted",
    createdAt: serverTimestamp(),
  });
}

export async function listSchoolStaff(): Promise<SchoolStaff[]> {
  const snap = await getDocs(query(staffCollection, orderBy("name", "asc")));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as SchoolStaff));
}

export async function addSchoolStaff(input: Omit<SchoolStaff, "id" | "createdAt" | "updatedAt">) {
  return addDoc(staffCollection, { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/**
 * Posts payroll and its matching expense together. The deterministic payment document ID
 * makes a second submission for the same staff/month fail instead of double-paying.
 * Expense is linked to that one canonical payroll payment ID.
 */
export interface SalaryAdvance {
  id: string;
  staffId: string;
  staffName: string;
  amount: number;
  recoveredAmount: number;
  outstandingAmount: number;
  issueDate: string;
  accountingMonth: string;
  reason: string;
  paymentMode: PaymentMode;
  expenseId: string;
  createdBy: string;
  createdAt?: unknown;
  status: "open" | "repaid";
  lastRecoveredPaymentId?: string | null;
}

export async function listSalaryAdvances(): Promise<SalaryAdvance[]> {
  const snap = await getDocs(query(collection(db, "salaryAdvances"), orderBy("issueDate", "desc")));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as SalaryAdvance));
}

export async function createSalaryAdvance(input: {
  staff: SchoolStaff; amount: number; issueDate: string; reason: string; paymentMode: PaymentMode; uid: string;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Advance amount must be greater than zero.");
  const advanceRef = doc(collection(db, "salaryAdvances"));
  const expenseRef = doc(expenseCollection, `advance_${advanceRef.id}`);
  const batch = writeBatch(db);
  batch.set(advanceRef, {
    staffId: input.staff.id, staffName: input.staff.name, amount: input.amount,
    recoveredAmount: 0, outstandingAmount: input.amount, issueDate: input.issueDate,
    accountingMonth: input.issueDate.slice(0, 7), reason: input.reason,
    paymentMode: input.paymentMode, expenseId: expenseRef.id, createdBy: input.uid,
    createdAt: serverTimestamp(), status: "open", lastRecoveredPaymentId: null,
  });
  batch.set(expenseRef, {
    title: `Salary advance — ${input.staff.name}`, category: "Salary Advance",
    amount: input.amount, transactionDate: input.issueDate, accountingMonth: input.issueDate.slice(0, 7),
    paymentMode: input.paymentMode, reference: advanceRef.id, notes: input.reason,
    createdBy: input.uid, createdAt: serverTimestamp(), status: "posted",
    linkedLeadId: null, linkedPayrollPaymentId: null, linkedSalaryAdvanceId: null, linkedSalaryAdvanceId: advanceRef.id,
  });
  await batch.commit();
  return advanceRef.id;
}

/**
 * Posts payroll and its expense as one atomic transaction. A deterministic payment ID
 * prevents duplicate staff/month payments. Optional advance recovery updates the chosen
 * advance balance in the same transaction and cannot exceed its outstanding amount.
 */
export async function payStaffMonth(input: {
  staff: SchoolStaff;
  accountingMonth: string;
  salaryAmount: number;
  deductions: number;
  advanceRecovery: number;
  advanceId?: string | null;
  paymentMode: PaymentMode;
  transactionDate: string;
  uid: string;
}) {
  const netAmount = input.salaryAmount - input.deductions - input.advanceRecovery;
  if (!Number.isFinite(netAmount) || netAmount <= 0) throw new Error("Net salary must be greater than zero.");
  if (input.deductions < 0 || input.advanceRecovery < 0) throw new Error("Deductions and advance recovery cannot be negative.");
  if (input.advanceRecovery > 0 && !input.advanceId) throw new Error("Select a salary advance to recover from.");
  if (input.advanceRecovery === 0 && input.advanceId) throw new Error("Enter an advance recovery amount or clear the advance selection.");

  const safeStaffId = input.staff.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const paymentId = `${input.accountingMonth}_${safeStaffId}`;
  const paymentRef = doc(payrollCollection, paymentId);
  const expenseRef = doc(expenseCollection, `payroll_${paymentId}`);
  const advanceRef = input.advanceId ? doc(db, "salaryAdvances", input.advanceId) : null;

  await runTransaction(db, async (transaction) => {
    const existingPayment = await transaction.get(paymentRef);
    if (existingPayment.exists()) throw new Error("Payroll already exists for this staff member and month.");
    const advanceSnap = advanceRef ? await transaction.get(advanceRef) : null;
    if (input.advanceRecovery > 0) {
      if (!advanceSnap?.exists()) throw new Error("Selected salary advance was not found.");
      const advance = advanceSnap.data() as SalaryAdvance;
      if (advance.staffId !== input.staff.id) throw new Error("Selected advance belongs to another staff member.");
      if (input.advanceRecovery > advance.outstandingAmount) throw new Error("Advance recovery cannot exceed the outstanding balance.");
    }

    transaction.set(paymentRef, {
      staffId: input.staff.id, staffName: input.staff.name, accountingMonth: input.accountingMonth,
      salaryAmount: input.salaryAmount, deductions: input.deductions, advanceRecovery: input.advanceRecovery,
      advanceId: input.advanceId ?? null, netAmount, paymentMode: input.paymentMode,
      transactionDate: input.transactionDate, expenseId: expenseRef.id, createdBy: input.uid,
      createdAt: serverTimestamp(), status: "paid",
    });
    transaction.set(expenseRef, {
      title: `Salary — ${input.staff.name}`, category: "Staff Salary", amount: netAmount,
      transactionDate: input.transactionDate, accountingMonth: input.accountingMonth,
      paymentMode: input.paymentMode, reference: paymentId,
      notes: `Payroll ${input.accountingMonth}; gross ₹${input.salaryAmount}; deductions ₹${input.deductions}; advance recovery ₹${input.advanceRecovery}`,
      createdBy: input.uid, createdAt: serverTimestamp(), status: "posted",
      linkedLeadId: null, linkedPayrollPaymentId: paymentId, linkedSalaryAdvanceId: null,
    });
    if (advanceRef && advanceSnap?.exists() && input.advanceRecovery > 0) {
      const advance = advanceSnap.data() as SalaryAdvance;
      const outstandingAmount = advance.outstandingAmount - input.advanceRecovery;
      transaction.update(advanceRef, {
        recoveredAmount: advance.recoveredAmount + input.advanceRecovery,
        outstandingAmount,
        status: outstandingAmount === 0 ? "repaid" : "open",
        lastRecoveredPaymentId: paymentId,
        updatedAt: serverTimestamp(),
      });
    }
  });
  return paymentId;
}

export async function listPayrollPayments(): Promise<PayrollPayment[]> {
  const snap = await getDocs(query(payrollCollection, orderBy("transactionDate", "desc")));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as PayrollPayment));
}

export interface FinanceClosing {
  id: string;
  createdBy: string;
  accountingMonth: string;
  openingCash: number;
  openingBank: number;
  countedCash: number;
  countedBank: number;
  expectedCash: number;
  expectedBank: number;
  cashDifference: number;
  bankDifference: number;
  notes: string;
  closedBy: string;
  closedAt?: unknown;
}

export async function getFinanceClosing(month: string): Promise<FinanceClosing | null> {
  const snap = await getDoc(doc(db, "financeClosings", month));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as FinanceClosing) : null;
}

export async function closeFinanceMonth(input: Omit<FinanceClosing, "id" | "closedAt">) {
  await setDoc(doc(db, "financeClosings", input.accountingMonth), {
    ...input,
    closedAt: serverTimestamp(),
  });
}

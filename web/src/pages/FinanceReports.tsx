import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileBarChart, Printer, RefreshCw } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { listExpenseSettlements, listFinanceEntries, listPayrollPayments, type ExpenseSettlement, type FinanceEntry, type PayrollPayment } from "@/lib/data/schoolFinance";
import { Button, Card, SectionHeading } from "@/components/ui";
import { downloadCsv } from "@/utils/csv";

const monthNow = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const shiftMonth = (month: string, offset: number) => {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (value: string) => {
  if (!value) return "Selected month";
  return new Date(`${value}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const changePct = (current: number, previous: number) => previous === 0 ? (current === 0 ? "0.0%" : "New") : `${current - previous > 0 ? "+" : ""}${((current - previous) / Math.abs(previous) * 100).toFixed(1)}%`;
const categoryTotals = (rows: FinanceEntry[], month: string) => {
  const totals = new Map<string, number>();
  rows.filter(x => x.status === "posted" && x.accountingMonth === month).forEach(x => totals.set(x.category, (totals.get(x.category) ?? 0) + x.amount));
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
};
const postedTotal = (rows: FinanceEntry[], month: string) => rows.filter(x => x.status === "posted" && x.accountingMonth === month).reduce((sum, x) => sum + x.amount, 0);

export function FinanceReports() {
  const { showToast } = useToast();
  const [month, setMonth] = useState(monthNow());
  const [income, setIncome] = useState<FinanceEntry[]>([]);
  const [expenses, setExpenses] = useState<FinanceEntry[]>([]);
  const [payroll, setPayroll] = useState<PayrollPayment[]>([]);
  const [settlements, setSettlements] = useState<ExpenseSettlement[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [i, e, p, s] = await Promise.all([listFinanceEntries("income"), listFinanceEntries("expense"), listPayrollPayments(), listExpenseSettlements()]);
      setIncome(i); setExpenses(e); setPayroll(p); setSettlements(s);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load finance reports.", "error");
    } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void refresh(); }, [refresh]);

  const previousMonth = shiftMonth(month, -1);
  const monthIncome = useMemo(() => income.filter(x => x.status === "posted" && x.accountingMonth === month), [income, month]);
  const monthExpenses = useMemo(() => expenses.filter(x => x.status === "posted" && x.accountingMonth === month), [expenses, month]);
  const totalIncome = monthIncome.reduce((sum, x) => sum + x.amount, 0);
  const totalExpense = monthExpenses.reduce((sum, x) => sum + x.amount, 0);
  const monthlyBalance = totalIncome - totalExpense;
  const previousIncome = postedTotal(income, previousMonth);
  const previousExpense = postedTotal(expenses, previousMonth);
  const previousBalance = previousIncome - previousExpense;
  const payrollTotal = payroll.filter(x => x.accountingMonth === month).reduce((sum, x) => sum + x.netAmount, 0);
  const incomeByCategory = useMemo(() => categoryTotals(income, month), [income, month]);
  const expenseByCategory = useMemo(() => categoryTotals(expenses, month), [expenses, month]);
  const previousIncomeByCategory = useMemo(() => new Map(categoryTotals(income, previousMonth)), [income, previousMonth]);
  const previousExpenseByCategory = useMemo(() => new Map(categoryTotals(expenses, previousMonth)), [expenses, previousMonth]);

  const reportRows = useMemo(() => [
    ...monthIncome.map(x => ({ type: "Income", date: x.transactionDate, accountingMonth: x.accountingMonth, description: x.title, category: x.category, amount: x.amount, paymentMode: x.paymentMode, reference: x.reference ?? "", paidBy: x.paidBy ?? "" })),
    ...monthExpenses.map(x => ({ type: "Expense", date: x.transactionDate, accountingMonth: x.accountingMonth, description: x.title, category: x.category, amount: x.amount, paymentMode: x.paymentMode, reference: x.reference ?? "", paidBy: x.paidBy ?? "" })),
    ...settlements.filter(x => x.accountingMonth === month).map(x => ({ type: "Reimbursement settlement", date: x.settlementDate, accountingMonth: x.accountingMonth, description: `Settlement for ${expenses.find(e => e.id === x.expenseId)?.title ?? x.expenseId}`, category: "Reimbursement settlement", amount: x.amount, paymentMode: x.paymentMode, reference: x.reference ?? "", paidBy: "" })),
  ].sort((a, b) => a.date.localeCompare(b.date)), [monthIncome, monthExpenses, settlements, month, expenses]);

  const printRows = (rows: FinanceEntry[], type: string) => rows.map(x => ({ ...x, type }));
  const fullRows = [...printRows(monthIncome, "Income"), ...printRows(monthExpenses, "Expense")].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
  const showPrint = () => window.print();

  return <div className="mx-auto max-w-[1440px] space-y-5 pb-8 finance-report-root">
    <style>{`
      .finance-report-paper { color:#243247; font-family:Inter,Arial,sans-serif; }
      .finance-report-paper .report-brand { color:#B89A5A; font-size:10px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
      .finance-report-paper .report-title { color:#12233F; font-size:27px; font-weight:750; letter-spacing:-.04em; line-height:1.15; }
      .finance-report-paper .report-muted { color:#687589; }
      .finance-report-paper .report-rule { height:3px; background:#B89A5A; margin:14px 0 20px; }
      .finance-report-paper .report-kpi { border:1px solid #DCE2EA; background:#F5F7FA; padding:14px; min-width:0; }
      .finance-report-paper .report-kpi:last-child { border-top:2px solid #B89A5A; }
      .finance-report-paper .report-kpi-label { color:#687589; font-size:10px; font-weight:750; letter-spacing:.08em; }
      .finance-report-paper .report-kpi-value { color:#12233F; font-size:22px; font-weight:800; margin-top:6px; }
      .finance-report-paper .report-section-title { color:#12233F; font-size:15px; font-weight:750; margin:20px 0 10px; }
      .finance-report-paper .report-table { width:100%; border-collapse:collapse; font-size:11px; }
      .finance-report-paper .report-table th { background:#12233F; color:white; text-align:left; font-size:9px; letter-spacing:.04em; padding:9px 8px; }
      .finance-report-paper .report-table td { border-bottom:1px solid #DCE2EA; padding:8px; vertical-align:top; }
      .finance-report-paper .report-table .right { text-align:right; white-space:nowrap; }
      .finance-report-paper .report-table .total td { background:#F5F0E5; color:#12233F; font-weight:800; border-top:1px solid #B89A5A; }
      .finance-report-paper .report-footer { border-top:1px solid #DCE2EA; color:#687589; font-size:8px; letter-spacing:.08em; margin-top:22px; padding-top:9px; }
      .finance-report-paper .report-page { background:#fff; border:1px solid #E2E5EB; border-radius:12px; padding:28px; }
      @media print {
        @page { size:A4; margin:12mm; }
        body { background:#fff !important; }
        body * { visibility:hidden; }
        .finance-report-paper, .finance-report-paper * { visibility:visible; }
        .finance-report-root { max-width:none !important; margin:0 !important; padding:0 !important; }
        .finance-report-paper { position:absolute; inset:0 auto auto 0; width:100%; }
        .finance-report-paper .report-page { border:0; border-radius:0; padding:0; margin:0; box-shadow:none; break-after:page; page-break-after:always; }
        .finance-report-paper .report-page:last-child { break-after:auto; page-break-after:auto; }
        .finance-report-paper .report-no-print { display:none !important; }
        .finance-report-paper .report-table { font-size:9px; }
        .finance-report-paper .report-table th { font-size:8px; padding:6px; }
        .finance-report-paper .report-table td { padding:5px 6px; }
        .finance-report-paper .report-kpi-value { font-size:18px; }
        .finance-report-paper .report-page-transactions { break-before:page; page-break-before:always; }
        .finance-report-paper .report-footer { margin-top:12px; }
      }
    `}</style>

    <SectionHeading eyebrow="Finance / Reports" title="Monthly finance report" description="A clear monthly summary, category comparison and full transaction list." />
    <div className="flex flex-wrap items-center justify-between gap-3 report-no-print">
      <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">Report month
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void refresh()}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
        <Button variant="secondary" size="sm" onClick={() => downloadCsv(`finance-report-${month}.csv`, reportRows)}><Download className="h-3.5 w-3.5" />Export CSV</Button>
        <Button size="sm" onClick={showPrint}><Printer className="h-3.5 w-3.5" />Print / Save PDF</Button>
      </div>
    </div>

    <div className="finance-report-paper space-y-4">
      <section className="report-page">
        <div className="report-brand">Little Millennium / Singanallur</div>
        <div className="report-title mt-3">Monthly Finance Report</div>
        <div className="report-muted mt-2 text-sm">{monthLabel(month)} <span className="mx-2">·</span> Management report</div>
        <div className="report-rule" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="report-kpi"><div className="report-kpi-label">TOTAL INCOME</div><div className="report-kpi-value">{loading ? "—" : money(totalIncome)}</div><div className="report-muted mt-2 text-xs">{changePct(totalIncome, previousIncome)} vs {monthLabel(previousMonth)}</div></div>
          <div className="report-kpi"><div className="report-kpi-label">TOTAL EXPENSES</div><div className="report-kpi-value">{loading ? "—" : money(totalExpense)}</div><div className="report-muted mt-2 text-xs">{changePct(totalExpense, previousExpense)} vs {monthLabel(previousMonth)}</div></div>
          <div className="report-kpi"><div className="report-kpi-label">MONTHLY BALANCE</div><div className="report-kpi-value">{loading ? "—" : money(monthlyBalance)}</div><div className="report-muted mt-2 text-xs">{changePct(monthlyBalance, previousBalance)} vs {monthLabel(previousMonth)}</div></div>
        </div>
        <div className="report-section-title">Monthly comparison</div>
        <div className="overflow-x-auto"><table className="report-table"><thead><tr><th>Summary</th><th className="right">Previous month</th><th className="right">Selected month</th><th className="right">Change</th></tr></thead><tbody>
          <tr><td>Income</td><td className="right">{money(previousIncome)}</td><td className="right">{money(totalIncome)}</td><td className="right">{changePct(totalIncome, previousIncome)}</td></tr>
          <tr><td>Expenses</td><td className="right">{money(previousExpense)}</td><td className="right">{money(totalExpense)}</td><td className="right">{changePct(totalExpense, previousExpense)}</td></tr>
          <tr className="total"><td>Monthly balance</td><td className="right">{money(previousBalance)}</td><td className="right">{money(monthlyBalance)}</td><td className="right">{changePct(monthlyBalance, previousBalance)}</td></tr>
        </tbody></table></div>
        <div className="report-section-title">At a glance</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[#DCE2EA] p-3"><div className="report-muted text-xs">Income entries</div><div className="mt-1 text-lg font-bold text-[#12233F]">{monthIncome.length}</div></div>
          <div className="rounded-lg border border-[#DCE2EA] p-3"><div className="report-muted text-xs">Expense entries</div><div className="mt-1 text-lg font-bold text-[#12233F]">{monthExpenses.length}</div></div>
          <div className="rounded-lg border border-[#DCE2EA] p-3"><div className="report-muted text-xs">Payroll paid</div><div className="mt-1 text-lg font-bold text-[#12233F]">{money(payrollTotal)}</div></div>
        </div>
        <div className="report-footer flex justify-between gap-3"><span>LITTLE MILLENNIUM SINGANALLUR · CONFIDENTIAL</span><span>{monthLabel(month)}</span></div>
      </section>

      <section className="report-page">
        <div className="report-brand">01 / Category details</div>
        <div className="report-title mt-3">Income &amp; expenses</div>
        <div className="report-muted mt-2 text-sm">Category totals and change from the previous month.</div>
        <div className="report-rule" />
        <div className="report-section-title mt-0">Income</div>
        <div className="overflow-x-auto"><table className="report-table"><thead><tr><th>Category</th><th className="right">Previous</th><th className="right">Selected</th><th className="right">Share</th><th className="right">Change</th></tr></thead><tbody>
          {incomeByCategory.map(([label, amount]) => <tr key={label}><td>{label}</td><td className="right">{money(previousIncomeByCategory.get(label) ?? 0)}</td><td className="right">{money(amount)}</td><td className="right">{totalIncome ? (amount / totalIncome * 100).toFixed(1) : "0.0"}%</td><td className="right">{changePct(amount, previousIncomeByCategory.get(label) ?? 0)}</td></tr>)}
          <tr className="total"><td>Total income</td><td className="right">{money(previousIncome)}</td><td className="right">{money(totalIncome)}</td><td className="right">100%</td><td className="right">{changePct(totalIncome, previousIncome)}</td></tr>
          {!loading && incomeByCategory.length === 0 && <tr><td colSpan={5} className="report-muted">No income entries for this month.</td></tr>}
        </tbody></table></div>
        <div className="report-section-title">Expenses</div>
        <div className="overflow-x-auto"><table className="report-table"><thead><tr><th>Category</th><th className="right">Previous</th><th className="right">Selected</th><th className="right">Share</th><th className="right">Change</th></tr></thead><tbody>
          {expenseByCategory.map(([label, amount]) => <tr key={label}><td>{label}</td><td className="right">{money(previousExpenseByCategory.get(label) ?? 0)}</td><td className="right">{money(amount)}</td><td className="right">{totalExpense ? (amount / totalExpense * 100).toFixed(1) : "0.0"}%</td><td className="right">{changePct(amount, previousExpenseByCategory.get(label) ?? 0)}</td></tr>)}
          <tr className="total"><td>Total expenses</td><td className="right">{money(previousExpense)}</td><td className="right">{money(totalExpense)}</td><td className="right">100%</td><td className="right">{changePct(totalExpense, previousExpense)}</td></tr>
          {!loading && expenseByCategory.length === 0 && <tr><td colSpan={5} className="report-muted">No expense entries for this month.</td></tr>}
        </tbody></table></div>
        <div className="report-footer flex justify-between gap-3"><span>LITTLE MILLENNIUM SINGANALLUR · CONFIDENTIAL</span><span>Category details</span></div>
      </section>

      <section className="report-page report-page-transactions">
        <div className="report-brand">02 / Transaction appendix</div>
        <div className="report-title mt-3">Transaction list</div>
        <div className="report-muted mt-2 text-sm">{monthLabel(month)} <span className="mx-2">·</span> {fullRows.length} income and expense entries</div>
        <div className="report-rule" />
        <div className="overflow-x-auto"><table className="report-table"><thead><tr><th>Date</th><th>Type</th><th>Category / details</th><th>Reference</th><th>Mode</th><th className="right">Amount</th></tr></thead><tbody>
          {fullRows.map((row, index) => <tr key={row.id ?? `${row.transactionDate}-${index}`}><td>{row.transactionDate}</td><td>{row.type}</td><td><strong>{row.category}</strong><div className="report-muted mt-1">{row.title}</div></td><td>{row.reference || "—"}</td><td>{row.paymentMode}</td><td className="right">{money(row.amount)}</td></tr>)}
          <tr className="total"><td colSpan={5}>Total income</td><td className="right">{money(totalIncome)}</td></tr>
          <tr className="total"><td colSpan={5}>Total expenses</td><td className="right">{money(totalExpense)}</td></tr>
          <tr className="total"><td colSpan={5}>Monthly balance</td><td className="right">{money(monthlyBalance)}</td></tr>
          {!loading && fullRows.length === 0 && <tr><td colSpan={6} className="report-muted">No transactions recorded for this month.</td></tr>}
        </tbody></table></div>
        <div className="report-footer flex justify-between gap-3"><span>LITTLE MILLENNIUM SINGANALLUR · CONFIDENTIAL</span><span>Transaction appendix</span></div>
      </section>
    </div>
  </div>;
}

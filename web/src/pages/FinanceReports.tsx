import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileBarChart, RefreshCw } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { listExpenseSettlements, listFinanceEntries, listPayrollPayments, type ExpenseSettlement, type FinanceEntry, type PayrollPayment } from "@/lib/data/schoolFinance";
import { Button, Card, SectionHeading } from "@/components/ui";
import { downloadCsv } from "@/utils/csv";

const monthNow = () => new Date().toLocaleDateString("en-CA").slice(0, 7);
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

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
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not load finance reports.", "error"); }
    finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void refresh(); }, [refresh]);
  const monthIncome = income.filter(x => x.status === "posted" && x.accountingMonth === month);
  const monthExpenses = expenses.filter(x => x.status === "posted" && x.accountingMonth === month);
  const totalIncome = monthIncome.reduce((sum, x) => sum + x.amount, 0);
  const totalExpense = monthExpenses.reduce((sum, x) => sum + x.amount, 0);
  const cashflowExpense = monthExpenses.filter(x => !(x.category === "Reimbursement" && x.paidBy)).reduce((sum, x) => sum + x.amount, 0) + settlements.filter(x => x.accountingMonth === month).reduce((sum, x) => sum + x.amount, 0);
  const payrollTotal = payroll.filter(x => x.accountingMonth === month).reduce((sum, x) => sum + x.netAmount, 0);
  const expenseByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    expenses.filter(x => x.status === "posted" && x.accountingMonth === month).forEach(x => totals.set(x.category, (totals.get(x.category) ?? 0) + x.amount));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses, month]);
  const incomeByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    income.filter(x => x.status === "posted" && x.accountingMonth === month).forEach(x => totals.set(x.category, (totals.get(x.category) ?? 0) + x.amount));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [income, month]);
  const byMode = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    income.filter(x => x.status === "posted" && x.accountingMonth === month).forEach(x => { const row = totals.get(x.paymentMode) ?? { income: 0, expense: 0 }; row.income += x.amount; totals.set(x.paymentMode, row); });
    expenses.filter(x => x.status === "posted" && x.accountingMonth === month && !(x.category === "Reimbursement" && x.paidBy)).forEach(x => { const row = totals.get(x.paymentMode) ?? { income: 0, expense: 0 }; row.expense += x.amount; totals.set(x.paymentMode, row); });
    settlements.filter(x => x.accountingMonth === month).forEach(x => { const row = totals.get(x.paymentMode) ?? { income: 0, expense: 0 }; row.expense += x.amount; totals.set(x.paymentMode, row); });
    return [...totals.entries()].sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense));
  }, [income, expenses, month]);
  const reportRows = [
    ...monthIncome.map(x => ({ type: "Income", date: x.transactionDate, accountingMonth: x.accountingMonth, description: x.title, category: x.category, amount: x.amount, paymentMode: x.paymentMode, reference: x.reference ?? "", paidBy: x.paidBy ?? "" })),
    ...monthExpenses.map(x => ({ type: "Expense", date: x.transactionDate, accountingMonth: x.accountingMonth, description: x.title, category: x.category, amount: x.amount, paymentMode: x.paymentMode, reference: x.reference ?? "", paidBy: x.paidBy ?? "" })),
    ...settlements.filter(x => x.accountingMonth === month).map(x => ({ type: "Reimbursement settlement", date: x.settlementDate, accountingMonth: x.accountingMonth, description: `Settlement for ${expenses.find(e => e.id === x.expenseId)?.title ?? x.expenseId}`, category: "Reimbursement Settlement", amount: x.amount, paymentMode: x.paymentMode, reference: x.reference ?? "", paidBy: "" })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
    <SectionHeading eyebrow="Finance / Insights" title="Finance reports" description="Month-wise income, expense categories, payroll and payment-mode summaries for management review."/>
    <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs font-medium text-ink-soft">Accounting month<input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={()=>void refresh()}><RefreshCw className="h-3.5 w-3.5"/>Refresh</Button><Button size="sm" onClick={()=>downloadCsv(`finance-report-${month}.csv`,reportRows)}><Download className="h-3.5 w-3.5"/>Export detailed CSV</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card><div className="text-xs text-ink-soft">Income received</div><div className="mt-3 text-2xl font-semibold">{loading?"—":money(totalIncome)}</div><div className="mt-1 text-xs text-ink-faint">{monthIncome.length} transactions</div></Card><Card><div className="text-xs text-ink-soft">Total expenses</div><div className="mt-3 text-2xl font-semibold">{loading?"—":money(totalExpense)}</div><div className="mt-1 text-xs text-ink-faint">{monthExpenses.length} transactions including payroll</div></Card><Card><div className="text-xs text-ink-soft">Payroll paid</div><div className="mt-3 text-2xl font-semibold">{loading?"—":money(payrollTotal)}</div><div className="mt-1 text-xs text-ink-faint">{payroll.filter(x=>x.accountingMonth===month).length} payroll payments</div></Card><Card><div className="text-xs text-ink-soft">Net movement</div><div className="mt-3 text-2xl font-semibold">{loading?"—":money(totalIncome-cashflowExpense)}</div><div className="mt-1 text-xs text-ink-faint">Cash-basis posted transaction total</div></Card></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card padded={false} className="overflow-hidden"><div className="flex items-center gap-3 border-b border-border p-4"><span className="rounded-xl bg-good-soft p-2 text-good"><FileBarChart className="h-4 w-4"/></span><div><h2 className="text-sm font-semibold">Income by category</h2><p className="mt-1 text-xs text-ink-faint">Posted receipts for {month}</p></div></div><div className="divide-y divide-border-soft">{incomeByCategory.map(([label,amount])=><div key={label} className="flex items-center justify-between gap-3 px-4 py-3"><span className="text-sm text-ink-soft">{label}</span><span className="text-sm font-semibold tabular-nums">{money(amount)}</span></div>)}{!loading&&incomeByCategory.length===0&&<p className="p-8 text-center text-sm text-ink-faint">No income recorded for this month.</p>}</div></Card>
      <Card padded={false} className="overflow-hidden"><div className="flex items-center gap-3 border-b border-border p-4"><span className="rounded-xl bg-bad-soft p-2 text-bad"><FileBarChart className="h-4 w-4"/></span><div><h2 className="text-sm font-semibold">Expenses by category</h2><p className="mt-1 text-xs text-ink-faint">Salary, advances, reimbursements and operating costs</p></div></div><div className="divide-y divide-border-soft">{expenseByCategory.map(([label,amount])=><div key={label} className="flex items-center justify-between gap-3 px-4 py-3"><span className="text-sm text-ink-soft">{label}</span><span className="text-sm font-semibold tabular-nums">{money(amount)}</span></div>)}{!loading&&expenseByCategory.length===0&&<p className="p-8 text-center text-sm text-ink-faint">No expenses recorded for this month.</p>}</div></Card>
    </div>
    <Card padded={false} className="overflow-hidden"><div className="border-b border-border p-4"><h2 className="text-sm font-semibold">Payment-mode reconciliation summary</h2><p className="mt-1 text-xs text-ink-faint">Compare receipt and payment volumes before month-end close.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="bg-bg text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-4 py-3">Payment mode</th><th className="px-4 py-3 text-right">Income</th><th className="px-4 py-3 text-right">Expense</th><th className="px-4 py-3 text-right">Net movement</th></tr></thead><tbody>{byMode.map(([mode,totals])=><tr key={mode} className="border-t border-border-soft"><td className="px-4 py-3 font-medium">{mode}</td><td className="px-4 py-3 text-right tabular-nums text-good">{money(totals.income)}</td><td className="px-4 py-3 text-right tabular-nums">{money(totals.expense)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(totals.income-totals.expense)}</td></tr>)}{!loading&&byMode.length===0&&<tr><td colSpan={4} className="px-4 py-8 text-center text-ink-faint">No transaction data.</td></tr>}</tbody></table></div></Card>
  </div>;
}

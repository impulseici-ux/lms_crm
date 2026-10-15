import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ReceiptText, RefreshCw, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { listFinanceEntries, listPayrollPayments, type FinanceEntry, type PayrollPayment } from "@/lib/data/schoolFinance";
import { Button, Card, SectionHeading } from "@/components/ui";

const monthNow = () => new Date().toLocaleDateString("en-CA").slice(0, 7);
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function FinanceOverview() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const [month, setMonth] = useState(monthNow());
  const [income, setIncome] = useState<FinanceEntry[]>([]);
  const [expenses, setExpenses] = useState<FinanceEntry[]>([]);
  const [payroll, setPayroll] = useState<PayrollPayment[]>([]);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    try {
      const [i,e,p] = await Promise.all([listFinanceEntries("income"),listFinanceEntries("expense"),listPayrollPayments()]);
      setIncome(i); setExpenses(e); setPayroll(p);
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not load finance summary.", "error"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void refresh();},[]);
  const monthIncome = useMemo(()=>income.filter(x=>x.status==="posted"&&x.accountingMonth===month).reduce((s,x)=>s+x.amount,0),[income,month]);
  const monthExpenses = useMemo(()=>expenses.filter(x=>x.status==="posted"&&x.accountingMonth===month).reduce((s,x)=>s+x.amount,0),[expenses,month]);
  const monthPayroll = useMemo(()=>payroll.filter(x=>x.accountingMonth===month).reduce((s,x)=>s+x.netAmount,0),[payroll,month]);
  const canManage = role==="admin"||role==="superadmin"||role==="management";
  const recent = [...income.map(x=>({...x,kind:"income" as const})),...expenses.map(x=>({...x,kind:"expense" as const}))].filter(x=>x.status==="posted"&&x.accountingMonth===month).sort((a,b)=>b.transactionDate.localeCompare(a.transactionDate)).slice(0,8);
  return <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
    <SectionHeading eyebrow="School operations / Finance" title="Finance overview" description="A single view of school receipts, operating costs and payroll, with month-based summaries."/>
    <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs font-medium text-ink-soft"><CalendarDays className="h-4 w-4"/><span>Accounting month</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label><Button variant="secondary" size="sm" onClick={()=>void refresh()}><RefreshCw className="h-3.5 w-3.5"/>Refresh data</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card><div className="flex items-center justify-between text-xs text-ink-soft"><span>Income received</span><span className="rounded-lg bg-good-soft p-2 text-good"><ArrowDownLeft className="h-4 w-4"/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{loading?"—":money(monthIncome)}</div><div className="mt-1 text-xs text-ink-faint">{month}</div></Card>
      <Card><div className="flex items-center justify-between text-xs text-ink-soft"><span>Operating expenses</span><span className="rounded-lg bg-bad-soft p-2 text-bad"><ArrowUpRight className="h-4 w-4"/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{loading?"—":money(monthExpenses-monthPayroll)}</div><div className="mt-1 text-xs text-ink-faint">Excluding linked payroll expenses</div></Card>
      <Card><div className="flex items-center justify-between text-xs text-ink-soft"><span>Payroll paid</span><span className="rounded-lg bg-accent-soft p-2 text-accent"><Wallet className="h-4 w-4"/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{loading?"—":money(monthPayroll)}</div><div className="mt-1 text-xs text-ink-faint">{payroll.filter(x=>x.accountingMonth===month).length} salary payments</div></Card>
      <Card><div className="flex items-center justify-between text-xs text-ink-soft"><span>Net cash movement</span><span className="rounded-lg bg-bg p-2 text-ink-soft"><ReceiptText className="h-4 w-4"/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{loading?"—":money(monthIncome-monthExpenses)}</div><div className="mt-1 text-xs text-ink-faint">Income less posted expenses</div></Card>
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
      <Card padded={false} className="overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="text-sm font-semibold">Recent transactions</h2><p className="mt-1 text-xs text-ink-faint">Posted entries for {month}</p></div><ReceiptText className="h-4 w-4 text-ink-faint"/></div><div className="divide-y divide-border-soft">{loading?<p className="p-8 text-center text-sm text-ink-faint">Loading transactions…</p>:recent.map(entry=><div key={entry.id} className="flex items-center gap-3 px-4 py-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${entry.kind==="income"?"bg-good-soft text-good":"bg-bad-soft text-bad"}`}>{entry.kind==="income"?<ArrowDownLeft className="h-4 w-4"/>:<ArrowUpRight className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{entry.title}</div><div className="mt-0.5 text-xs text-ink-faint">{entry.transactionDate} · {entry.category}</div></div><div className={`whitespace-nowrap text-sm font-semibold tabular-nums ${entry.kind==="income"?"text-good":"text-ink"}`}>{entry.kind==="income"?"+":"−"}{money(entry.amount)}</div></div>)}{!loading&&recent.length===0&&<p className="p-8 text-center text-sm text-ink-faint">No posted transactions in this accounting month yet.</p>}</div></Card>
      <Card><h2 className="text-sm font-semibold">Quick actions</h2><p className="mt-1 text-xs text-ink-faint">Open the register you need.</p><div className="mt-4 space-y-2"><Link to="/finance/income" className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:border-accent/30 hover:bg-accent-soft/40"><span className="text-sm font-medium">Income register</span><ArrowDownLeft className="h-4 w-4 text-good"/></Link><Link to="/finance/expenses" className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:border-accent/30 hover:bg-accent-soft/40"><span className="text-sm font-medium">Expense register</span><ArrowUpRight className="h-4 w-4 text-ink-soft"/></Link>{canManage&&<Link to="/finance/payroll" className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:border-accent/30 hover:bg-accent-soft/40"><span className="text-sm font-medium">Staff & payroll</span><Wallet className="h-4 w-4 text-accent"/></Link>}</div><div className="mt-5 rounded-xl border border-warn/20 bg-warn-soft/50 p-3"><div className="text-xs font-semibold text-warn">Month-end reminder</div><p className="mt-1 text-xs leading-5 text-ink-soft">Before closing a month, reconcile cash and bank balances against receipts and payments. Closing and reconciliation workflow will be a separate controlled step.</p></div></Card>
    </div>
  </div>;
}

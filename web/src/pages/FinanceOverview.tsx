import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ReceiptText, RefreshCw, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { closeFinanceMonth, getFinanceClosing, listFinanceEntries, listPayrollPayments, type FinanceClosing, type FinanceEntry, type PayrollPayment } from "@/lib/data/schoolFinance";
import { Button, Card, SectionHeading } from "@/components/ui";

const monthNow = () => new Date().toLocaleDateString("en-CA").slice(0, 7);
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function FinanceOverview() {
  const { role, user, profile } = useAuth();
  const { showToast } = useToast();
  const [month, setMonth] = useState(monthNow());
  const [income, setIncome] = useState<FinanceEntry[]>([]);
  const [expenses, setExpenses] = useState<FinanceEntry[]>([]);
  const [payroll, setPayroll] = useState<PayrollPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<FinanceClosing | null>(null);
  const [openingCash, setOpeningCash] = useState("0");
  const [openingBank, setOpeningBank] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [countedBank, setCountedBank] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closingSaving, setClosingSaving] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      const [i,e,p] = await Promise.all([listFinanceEntries("income"),listFinanceEntries("expense"),listPayrollPayments()]);
      setIncome(i); setExpenses(e); setPayroll(p);
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not load finance summary.", "error"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>{let active=true; void getFinanceClosing(month).then(result=>{if(active){setClosing(result);if(result){setOpeningCash(String(result.openingCash));setOpeningBank(String(result.openingBank));setCountedCash(String(result.countedCash));setCountedBank(String(result.countedBank));setClosingNotes(result.notes);}}}).catch(error=>showToast(error instanceof Error?error.message:"Could not load month closing.","error")); return ()=>{active=false;};},[month,showToast]);
  const monthIncome = useMemo(()=>income.filter(x=>x.status==="posted"&&x.accountingMonth===month).reduce((s,x)=>s+x.amount,0),[income,month]);
  const monthExpenses = useMemo(()=>expenses.filter(x=>x.status==="posted"&&x.accountingMonth===month).reduce((s,x)=>s+x.amount,0),[expenses,month]);
  const monthPayroll = useMemo(()=>payroll.filter(x=>x.accountingMonth===month).reduce((s,x)=>s+x.netAmount,0),[payroll,month]);
  const monthExpenseEntries = expenses.filter(x=>x.status==="posted"&&x.accountingMonth===month);
  const operatingExpenses = monthExpenseEntries.filter(x=>!x.linkedPayrollPaymentId).reduce((s,x)=>s+x.amount,0);
  const cashIncome = income.filter(x=>x.status==="posted"&&x.accountingMonth===month&&x.paymentMode==="Cash").reduce((s,x)=>s+x.amount,0);
  const cashExpenses = monthExpenseEntries.filter(x=>x.paymentMode==="Cash").reduce((s,x)=>s+x.amount,0);
  const bankModes = ["UPI","Bank Transfer","Card","Cheque"];
  const bankIncome = income.filter(x=>x.status==="posted"&&x.accountingMonth===month&&bankModes.includes(x.paymentMode)).reduce((s,x)=>s+x.amount,0);
  const bankExpenses = monthExpenseEntries.filter(x=>bankModes.includes(x.paymentMode)).reduce((s,x)=>s+x.amount,0);
  const expectedCash = (Number(openingCash)||0)+cashIncome-cashExpenses;
  const expectedBank = (Number(openingBank)||0)+bankIncome-bankExpenses;
  const canManage = role==="admin"||role==="superadmin"||role==="management";
  const recent = [...income.map(x=>({...x,kind:"income" as const})),...expenses.map(x=>({...x,kind:"expense" as const}))].filter(x=>x.status==="posted"&&x.accountingMonth===month).sort((a,b)=>b.transactionDate.localeCompare(a.transactionDate)).slice(0,8);
  return <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
    <SectionHeading eyebrow="School operations / Finance" title="Finance overview" description="A single view of school receipts, operating costs and payroll, with month-based summaries."/>
    <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs font-medium text-ink-soft"><CalendarDays className="h-4 w-4"/><span>Accounting month</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label><Button variant="secondary" size="sm" onClick={()=>void refresh()}><RefreshCw className="h-3.5 w-3.5"/>Refresh data</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card><div className="flex items-center justify-between text-xs text-ink-soft"><span>Income received</span><span className="rounded-lg bg-good-soft p-2 text-good"><ArrowDownLeft className="h-4 w-4"/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{loading?"—":money(monthIncome)}</div><div className="mt-1 text-xs text-ink-faint">{month}</div></Card>
      <Card><div className="flex items-center justify-between text-xs text-ink-soft"><span>Operating expenses</span><span className="rounded-lg bg-bad-soft p-2 text-bad"><ArrowUpRight className="h-4 w-4"/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{loading?"—":money(operatingExpenses)}</div><div className="mt-1 text-xs text-ink-faint">Excluding linked payroll expenses</div></Card>
      <Card><div className="flex items-center justify-between text-xs text-ink-soft"><span>Payroll paid</span><span className="rounded-lg bg-accent-soft p-2 text-accent"><Wallet className="h-4 w-4"/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{loading?"—":money(monthPayroll)}</div><div className="mt-1 text-xs text-ink-faint">{payroll.filter(x=>x.accountingMonth===month).length} salary payments</div></Card>
      <Card><div className="flex items-center justify-between text-xs text-ink-soft"><span>Net cash movement</span><span className="rounded-lg bg-bg p-2 text-ink-soft"><ReceiptText className="h-4 w-4"/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{loading?"—":money(monthIncome-monthExpenses)}</div><div className="mt-1 text-xs text-ink-faint">Income less posted expenses</div></Card>
    </div>
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-sm font-semibold">Cash & bank reconciliation</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-ink-faint">Enter opening balances and actual counted/statement balances. Expected balances are calculated from posted transactions for the selected month.</p></div>
        {closing&&<span className="rounded-full bg-good-soft px-2.5 py-1 text-[11px] font-semibold text-good">Month closed</span>}
      </div>
      {closing ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-3"><div className="text-xs text-ink-faint">Cash difference</div><div className="mt-1 text-lg font-semibold">{money(closing.cashDifference)}</div></div><div className="rounded-xl border border-border p-3"><div className="text-xs text-ink-faint">Bank difference</div><div className="mt-1 text-lg font-semibold">{money(closing.bankDifference)}</div></div><p className="text-xs leading-5 text-ink-faint sm:col-span-2">Closed by {closing.closedBy}. This month is locked for new financial entries. To correct a closed period, use an audited adjustment/reopen process.</p></div> : <form className="mt-4 space-y-4" onSubmit={async e=>{e.preventDefault();if(!canManage||!Number.isFinite(Number(countedCash))||!Number.isFinite(Number(countedBank))){showToast("Enter valid counted cash and bank balances.","error");return;}setClosingSaving(true);try{if(!user){throw new Error("Your session has expired. Sign in again.");}await closeFinanceMonth({createdBy:user.uid,accountingMonth:month,openingCash:Number(openingCash)||0,openingBank:Number(openingBank)||0,countedCash:Number(countedCash),countedBank:Number(countedBank),expectedCash,expectedBank,cashDifference:Number(countedCash)-expectedCash,bankDifference:Number(countedBank)-expectedBank,notes:closingNotes,closedBy:profile?.displayName||user.uid});setClosing(await getFinanceClosing(month));showToast("Month closing saved. New entries for this month will be blocked by Firestore rules.","success");}catch(error){showToast(error instanceof Error?error.message:"Could not close month.","error");}finally{setClosingSaving(false);}}}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-ink-soft">Opening cash (₹)<input type="number" min="0" step="0.01" value={openingCash} onChange={e=>setOpeningCash(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
          <label className="text-xs font-medium text-ink-soft">Actual closing cash (₹)<input required type="number" min="0" step="0.01" value={countedCash} onChange={e=>setCountedCash(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
          <label className="text-xs font-medium text-ink-soft">Opening bank (₹)<input type="number" min="0" step="0.01" value={openingBank} onChange={e=>setOpeningBank(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
          <label className="text-xs font-medium text-ink-soft">Actual closing bank (₹)<input required type="number" min="0" step="0.01" value={countedBank} onChange={e=>setCountedBank(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-bg p-3"><div className="text-xs text-ink-faint">Expected cash balance</div><div className="mt-1 text-lg font-semibold tabular-nums">{money(expectedCash)}</div></div><div className="rounded-xl bg-bg p-3"><div className="text-xs text-ink-faint">Expected bank balance</div><div className="mt-1 text-lg font-semibold tabular-nums">{money(expectedBank)}</div></div></div>
        <label className="block text-xs font-medium text-ink-soft">Closing notes<input value={closingNotes} onChange={e=>setClosingNotes(e.target.value)} placeholder="Statement reference, differences or notes" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        {canManage&&<Button type="submit" disabled={closingSaving||!countedCash||!countedBank}>{closingSaving?"Closing month…":"Reconcile & close month"}</Button>}
        <p className="text-xs leading-5 text-warn">Closing is permanent in this first version. Verify all receipts, expenses and payroll before confirming; reopen/adjustment flow is not yet implemented.</p>
      </form>}
    </Card>
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
      <Card padded={false} className="overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="text-sm font-semibold">Recent transactions</h2><p className="mt-1 text-xs text-ink-faint">Posted entries for {month}</p></div><ReceiptText className="h-4 w-4 text-ink-faint"/></div><div className="divide-y divide-border-soft">{loading?<p className="p-8 text-center text-sm text-ink-faint">Loading transactions…</p>:recent.map(entry=><div key={entry.id} className="flex items-center gap-3 px-4 py-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${entry.kind==="income"?"bg-good-soft text-good":"bg-bad-soft text-bad"}`}>{entry.kind==="income"?<ArrowDownLeft className="h-4 w-4"/>:<ArrowUpRight className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{entry.title}</div><div className="mt-0.5 text-xs text-ink-faint">{entry.transactionDate} · {entry.category}</div></div><div className={`whitespace-nowrap text-sm font-semibold tabular-nums ${entry.kind==="income"?"text-good":"text-ink"}`}>{entry.kind==="income"?"+":"−"}{money(entry.amount)}</div></div>)}{!loading&&recent.length===0&&<p className="p-8 text-center text-sm text-ink-faint">No posted transactions in this accounting month yet.</p>}</div></Card>
      <Card><h2 className="text-sm font-semibold">Quick actions</h2><p className="mt-1 text-xs text-ink-faint">Open the register you need.</p><div className="mt-4 space-y-2"><Link to="/finance/income" className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:border-accent/30 hover:bg-accent-soft/40"><span className="text-sm font-medium">Income register</span><ArrowDownLeft className="h-4 w-4 text-good"/></Link><Link to="/finance/expenses" className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:border-accent/30 hover:bg-accent-soft/40"><span className="text-sm font-medium">Expense register</span><ArrowUpRight className="h-4 w-4 text-ink-soft"/></Link>{canManage&&<Link to="/finance/payroll" className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:border-accent/30 hover:bg-accent-soft/40"><span className="text-sm font-medium">Staff & payroll</span><Wallet className="h-4 w-4 text-accent"/></Link>}</div><div className="mt-5 rounded-xl border border-warn/20 bg-warn-soft/50 p-3"><div className="text-xs font-semibold text-warn">Month-end reminder</div><p className="mt-1 text-xs leading-5 text-ink-soft">Before closing a month, reconcile cash and bank balances against receipts and payments. Closing and reconciliation workflow will be a separate controlled step.</p></div></Card>
    </div>
  </div>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Download, Plus, RefreshCw, Users, WalletCards } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { addSchoolStaff, createSalaryAdvance, listPayrollPayments, listSalaryAdvances, listSchoolStaff, payStaffMonth, type PaymentMode, type PayrollPayment, type SalaryAdvance, type SchoolStaff } from "@/lib/data/schoolFinance";
import { Button, Card, SectionHeading } from "@/components/ui";
import { downloadCsv } from "@/utils/csv";

const today = () => new Date().toLocaleDateString("en-CA");
const currentMonth = today().slice(0, 7);
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const modes: PaymentMode[] = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque"];

export function StaffPayroll() {
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const canWrite = role === "admin" || role === "superadmin" || role === "management";
  const [staff, setStaff] = useState<SchoolStaff[]>([]);
  const [payments, setPayments] = useState<PayrollPayment[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [mobile, setMobile] = useState("");
  const [salary, setSalary] = useState("");
  const [joiningDate, setJoiningDate] = useState(today());
  const [staffId, setStaffId] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [gross, setGross] = useState("");
  const [deductions, setDeductions] = useState("0");
  const [recovery, setRecovery] = useState("0");
  const [payDate, setPayDate] = useState(today());
  const [mode, setMode] = useState<PaymentMode>("Bank Transfer");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [advanceDate, setAdvanceDate] = useState(today());
  const [advanceMode, setAdvanceMode] = useState<PaymentMode>("Bank Transfer");
  const [advanceId, setAdvanceId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [people, paid, advanceRows] = await Promise.all([listSchoolStaff(), listPayrollPayments(), listSalaryAdvances()]);
      setStaff(people); setPayments(paid); setAdvances(advanceRows);
      if (!staffId && people.length) { setStaffId(people[0].id); setGross(String(people[0].monthlySalary)); }
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not load payroll.", "error"); }
    finally { setLoading(false); }
  }, [showToast, staffId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const activeStaff = staff.filter(person => person.active);
  const selectedStaff = activeStaff.find(person => person.id === staffId);
  const selectedAdvance = advances.find(advance => advance.id === advanceId && advance.staffId === staffId && advance.status === "open");
  const availableAdvances = advances.filter(advance => advance.staffId === staffId && advance.status === "open" && advance.outstandingAmount > 0);
  const alreadyPaid = useMemo(() => new Set(payments.map(p => `${p.accountingMonth}:${p.staffId}`)), [payments]);
  const paidThisMonth = payments.filter(p => p.accountingMonth === month);
  const totalPayroll = paidThisMonth.reduce((sum, p) => sum + p.netAmount, 0);

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    if (!name.trim() || !jobTitle.trim() || Number(salary) <= 0) { showToast("Enter staff name, role and a valid salary.", "error"); return; }
    setSaving(true);
    try {
      await addSchoolStaff({ name: name.trim(), roleTitle: jobTitle.trim(), mobile: mobile.trim(), monthlySalary: Number(salary), joiningDate, active: true });
      showToast("Staff profile created.", "success");
      setName(""); setJobTitle(""); setMobile(""); setSalary(""); setShowStaffForm(false);
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not create staff profile.", "error"); }
    finally { setSaving(false); }
  }

  async function createAdvance(event: FormEvent) {
    event.preventDefault();
    if (!user || !canWrite || !selectedStaff) { showToast("Select an active staff member first.", "error"); return; }
    setSaving(true);
    try { await createSalaryAdvance({ staff: selectedStaff, amount: Number(advanceAmount), issueDate: advanceDate, reason: advanceReason.trim(), paymentMode: advanceMode, uid: user.uid }); showToast("Salary advance recorded and linked to expenses.", "success"); setAdvanceAmount(""); setAdvanceReason(""); setShowAdvanceForm(false); await refresh(); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not record salary advance.", "error"); }
    finally { setSaving(false); }
  }

  async function paySalary(event: FormEvent) {
    event.preventDefault();
    if (!user || !canWrite || !selectedStaff) return;
    if (alreadyPaid.has(`${month}:${selectedStaff.id}`)) { showToast("Payroll already exists for this staff member and month.", "error"); return; }
    setSaving(true);
    try {
      const id = await payStaffMonth({ staff: selectedStaff, accountingMonth: month, salaryAmount: Number(gross), deductions: Number(deductions), advanceRecovery: Number(recovery), advanceId: Number(recovery) > 0 ? advanceId : null, paymentMode: mode, transactionDate: payDate, uid: user.uid });
      showToast(`Salary payment posted · ${id}`, "success");
      setShowPayrollForm(false); setDeductions("0"); setRecovery("0");
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not post salary. If this month was already paid, refresh payroll before retrying.", "error"); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
    <SectionHeading eyebrow="People / Compensation" title="Staff & payroll" description="Maintain a school employee directory, fixed salary, deductions, advances recovery and salary payment history."/>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><div className="flex items-center gap-2 text-xs font-medium text-ink-soft"><Users className="h-4 w-4"/>Active staff</div><div className="mt-3 text-2xl font-semibold">{activeStaff.length}</div><div className="mt-1 text-xs text-ink-faint">Separate from CRM login accounts</div></Card>
      <Card><div className="flex items-center gap-2 text-xs font-medium text-ink-soft"><WalletCards className="h-4 w-4"/>Payroll paid · {month}</div><div className="mt-3 text-2xl font-semibold">{money(totalPayroll)}</div><div className="mt-1 text-xs text-ink-faint">{paidThisMonth.length} payment records</div></Card>
      <Card><div className="text-xs font-medium text-ink-soft">Pending salary records</div><div className="mt-3 text-2xl font-semibold">{activeStaff.filter(p=>!alreadyPaid.has(`${month}:${p.id}`)).length}</div><div className="mt-1 text-xs text-ink-faint">Based on selected accounting month</div></Card>
    </div>
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-sm font-semibold">Staff directory</h2><p className="mt-1 text-xs text-ink-faint">Employee data is not stored in the CRM authentication users collection.</p></div>
        <div className="flex flex-wrap gap-2">{canWrite&&<><Button size="sm" onClick={()=>setShowStaffForm(v=>!v)}><Plus className="h-3.5 w-3.5"/>Add staff</Button><Button variant="secondary" size="sm" onClick={()=>setShowAdvanceForm(v=>!v)}><Plus className="h-3.5 w-3.5"/>Issue advance</Button></>}<Button variant="secondary" size="sm" onClick={()=>void refresh()}><RefreshCw className="h-3.5 w-3.5"/>Refresh</Button></div>
      </div>
      {showStaffForm&&canWrite&&<form onSubmit={createStaff} className="grid gap-3 border-b border-border bg-bg/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium text-ink-soft">Full name<input required value={name} onChange={e=>setName(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Job title<input required value={jobTitle} onChange={e=>setJobTitle(e.target.value)} placeholder="Teacher / Assistant / Admin" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Mobile<input value={mobile} onChange={e=>setMobile(e.target.value)} inputMode="tel" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Fixed monthly salary (₹)<input required type="number" min="1" step="0.01" value={salary} onChange={e=>setSalary(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Joining date<input required type="date" value={joiningDate} onChange={e=>setJoiningDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <div className="flex items-end gap-2"><Button type="submit" disabled={saving}>{saving?"Saving…":"Save staff"}</Button><Button type="button" variant="secondary" onClick={()=>setShowStaffForm(false)}>Cancel</Button></div>
      </form>}
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-bg text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-4 py-3">Staff member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Mobile</th><th className="px-4 py-3 text-right">Fixed monthly salary</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{loading?<tr><td colSpan={5} className="px-4 py-10 text-center text-ink-faint">Loading staff…</td></tr>:staff.map(p=><tr key={p.id} className="border-t border-border-soft hover:bg-bg/60"><td className="px-4 py-3 font-medium">{p.name}<div className="mt-0.5 text-[11px] text-ink-faint">Joined {p.joiningDate}</div></td><td className="px-4 py-3 text-ink-soft">{p.roleTitle}</td><td className="px-4 py-3 text-ink-soft">{p.mobile||"—"}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(p.monthlySalary)}</td><td className="px-4 py-3"><span className="rounded-full bg-good-soft px-2.5 py-1 text-[11px] font-semibold text-good">{p.active?"Active":"Inactive"}</span></td></tr>)}{!loading&&staff.length===0&&<tr><td colSpan={5} className="px-4 py-12 text-center text-ink-faint">No staff profiles yet. Add the first employee to begin.</td></tr>}</tbody></table></div>
    </Card>
      {showAdvanceForm&&canWrite&&<Card><form onSubmit={createAdvance} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div className="sm:col-span-2 lg:col-span-3"><h2 className="text-sm font-semibold">Issue salary advance</h2><p className="mt-1 text-xs text-ink-faint">The advance is posted as an expense and its outstanding balance is tracked for later payroll recovery.</p></div>
        <label className="text-xs font-medium text-ink-soft">Staff member<select required value={staffId} onChange={e=>{setStaffId(e.target.value);const person=activeStaff.find(x=>x.id===e.target.value);if(person)setGross(String(person.monthlySalary));}} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink">{activeStaff.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="text-xs font-medium text-ink-soft">Advance amount (₹)<input required type="number" min="1" step="0.01" value={advanceAmount} onChange={e=>setAdvanceAmount(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Issue date<input required type="date" value={advanceDate} onChange={e=>setAdvanceDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Payment mode<select value={advanceMode} onChange={e=>setAdvanceMode(e.target.value as PaymentMode)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink">{modes.map(m=><option key={m}>{m}</option>)}</select></label>
        <label className="text-xs font-medium text-ink-soft sm:col-span-2">Reason<input required value={advanceReason} onChange={e=>setAdvanceReason(e.target.value)} placeholder="Reason for advance" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <div className="flex items-end gap-2"><Button type="submit" disabled={saving||!selectedStaff||Number(advanceAmount)<=0}>{saving?"Saving…":"Record advance"}</Button><Button type="button" variant="secondary" onClick={()=>setShowAdvanceForm(false)}>Cancel</Button></div>
      </form></Card>}
      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-border p-4"><h2 className="text-sm font-semibold">Salary advances</h2><p className="mt-1 text-xs text-ink-faint">Outstanding balances are reduced only when a matching payroll recovery is posted.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-bg text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3 text-right">Advance</th><th className="px-4 py-3 text-right">Recovered</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{advances.map(advance=><tr key={advance.id} className="border-t border-border-soft"><td className="px-4 py-3 font-medium">{advance.staffName}<div className="mt-0.5 text-[10px] text-ink-faint">{advance.reason}</div></td><td className="px-4 py-3 text-xs text-ink-soft">{advance.issueDate}</td><td className="px-4 py-3 text-right tabular-nums">{money(advance.amount)}</td><td className="px-4 py-3 text-right tabular-nums">{money(advance.recoveredAmount)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(advance.outstandingAmount)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${advance.status==="repaid"?"bg-good-soft text-good":"bg-warn-soft text-warn"}`}>{advance.status}</span></td></tr>)}{!loading&&advances.length===0&&<tr><td colSpan={6} className="px-4 py-8 text-center text-ink-faint">No salary advances recorded.</td></tr>}</tbody></table></div>
      </Card>
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Monthly payroll</h2><p className="mt-1 text-xs text-ink-faint">Salary payment and its expense record are posted together under one payment ID.</p></div><div className="flex flex-wrap gap-2"><input aria-label="Payroll month" type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm"/><Button variant="secondary" size="sm" onClick={()=>downloadCsv(`payroll-${month}.csv`,paidThisMonth.map(p=>({month:p.accountingMonth,staff:p.staffName,gross:p.salaryAmount,deductions:p.deductions,advanceRecovery:p.advanceRecovery,net:p.netAmount,mode:p.paymentMode,date:p.transactionDate,paymentId:p.id})))}><Download className="h-3.5 w-3.5"/>Export</Button>{canWrite&&<Button size="sm" onClick={()=>setShowPayrollForm(v=>!v)}><Plus className="h-3.5 w-3.5"/>Pay salary</Button>}</div></div>
      {showPayrollForm&&canWrite&&<form onSubmit={paySalary} className="grid gap-3 border-b border-border bg-bg/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium text-ink-soft">Staff member<select required value={staffId} onChange={e=>{setStaffId(e.target.value);const p=activeStaff.find(x=>x.id===e.target.value);if(p)setGross(String(p.monthlySalary));}} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink">{activeStaff.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.monthlySalary)}</option>)}</select></label>
        <label className="text-xs font-medium text-ink-soft">Accounting month<input required type="month" value={month} onChange={e=>setMonth(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Gross salary (₹)<input required type="number" min="0.01" step="0.01" value={gross} onChange={e=>setGross(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Approved deductions (₹)<input required type="number" min="0" step="0.01" value={deductions} onChange={e=>setDeductions(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Recover from advance<select value={advanceId} onChange={e=>{setAdvanceId(e.target.value);setRecovery(e.target.value?"0":"0");}} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"><option value="">No advance recovery</option>{availableAdvances.map(a=><option key={a.id} value={a.id}>{a.reason} · outstanding {money(a.outstandingAmount)}</option>)}</select></label>
        <label className="text-xs font-medium text-ink-soft">Advance recovery (₹)<input required type="number" min="0" max={selectedAdvance?.outstandingAmount??0} step="0.01" value={recovery} onChange={e=>setRecovery(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/>{selectedAdvance&&<span className="mt-1 block text-[10px] text-ink-faint">Outstanding: {money(selectedAdvance.outstandingAmount)}</span>}</label>
        <label className="text-xs font-medium text-ink-soft">Net payable (₹)<input readOnly value={money((Number(gross)||0)-(Number(deductions)||0)-(Number(recovery)||0))} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Payment date<input required type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Payment mode<select value={mode} onChange={e=>setMode(e.target.value as PaymentMode)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink">{modes.map(m=><option key={m}>{m}</option>)}</select></label>
        <div className="flex items-end gap-2"><Button type="submit" disabled={saving||!selectedStaff||Number(gross)<=0||Number(gross)<=Number(deductions)+Number(recovery)||alreadyPaid.has(`${month}:${staffId}`)||(Number(recovery)>0&&!advanceId)||(Number(recovery)>0&&(!selectedAdvance||Number(recovery)>selectedAdvance.outstandingAmount))}>{saving?"Posting…":"Post salary payment"}</Button><Button type="button" variant="secondary" onClick={()=>setShowPayrollForm(false)}>Cancel</Button></div>
        {alreadyPaid.has(`${month}:${staffId}`)&&<p className="text-xs text-bad sm:col-span-2 lg:col-span-3">A payroll record already exists for this staff member and month.</p>}
      </form>}
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-bg text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-4 py-3">Paid on</th><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">Deductions</th><th className="px-4 py-3 text-right">Net paid</th><th className="px-4 py-3">Payment ID</th></tr></thead><tbody>{payments.filter(p=>p.accountingMonth===month).map(p=><tr key={p.id} className="border-t border-border-soft hover:bg-bg/60"><td className="px-4 py-3 text-xs text-ink-soft">{p.transactionDate}</td><td className="px-4 py-3 font-medium">{p.staffName}</td><td className="px-4 py-3">{p.accountingMonth}</td><td className="px-4 py-3 text-right tabular-nums">{money(p.salaryAmount)}</td><td className="px-4 py-3 text-right tabular-nums">{money(p.deductions+p.advanceRecovery)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(p.netAmount)}</td><td className="px-4 py-3 font-mono text-[10px] text-ink-faint">{p.id}</td></tr>)}{!loading&&paidThisMonth.length===0&&<tr><td colSpan={7} className="px-4 py-12 text-center text-ink-faint">No payroll payments for {month}.</td></tr>}</tbody></table></div>
    </Card>
    <p className="text-xs leading-5 text-ink-faint">Payroll uses fixed salary with explicit approved deductions. Attendance remains in its existing separate process. Salary advance recovery is linked to an open advance and updates its outstanding balance atomically with the payroll payment.</p>
  </div>;
}

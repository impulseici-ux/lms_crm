import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, Plus, RefreshCw, Search, Wallet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useLeads } from "@/hooks/useLeads";
import { addFinanceEntry, listExpenseSettlements, listFinanceEntries, postAdmissionIncome, settleReimbursement, type ExpenseSettlement, type FinanceEntry, type FinanceKind, type PaymentMode } from "@/lib/data/schoolFinance";
import { formatAmountForCsv, formatCurrency } from "@/lib/currency";
import { Button, Card, SectionHeading } from "@/components/ui";
import { downloadCsv } from "@/utils/csv";

const INCOME_CATEGORIES = ["School Fees", "Admission Fee", "Activity Fee", "Transport", "Other Income"];
const EXPENSE_CATEGORIES = ["Rent", "Milk & Snacks", "Meta Ads", "Justdial", "Stationery", "Pamphlets", "Field Trips", "Utilities", "Repairs & Maintenance", "Reimbursement", "Other Expense"];
const MODES: PaymentMode[] = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque"];
const today = () => new Date().toLocaleDateString("en-CA");
const monthOf = (date: string) => date.slice(0, 7);
const rupees = formatCurrency;

export function FinanceRegister({ kind }: { kind: FinanceKind }) {
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const { leads } = useLeads();
  const isIncome = kind === "income";
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [settlements, setSettlements] = useState<ExpenseSettlement[]>([]);
  const [settlingEntry, setSettlingEntry] = useState<FinanceEntry | null>(null);
  const [settlementDate, setSettlementDate] = useState(today());
  const [settlementMode, setSettlementMode] = useState<PaymentMode>("Bank Transfer");
  const [settlementReference, setSettlementReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(monthOf(today()));
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(isIncome ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [entryMonth, setEntryMonth] = useState(monthOf(today()));
  const [linkedLeadId, setLinkedLeadId] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [mode, setMode] = useState<PaymentMode>("UPI");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [posting, setPosting] = useState<string | null>(null);

  // Only leads actually confirmed as admitted — this is the point real fee payments
  // start, so it's the only stage worth offering in the link-to-enquiry dropdown.
  const admittedLeads = useMemo(() => leads.filter((lead) => lead.status === "Admission Confirmed"), [leads]);
  // Admission payments a counsellor captured on the lead (see LeadProfile.tsx's
  // confirmAdmission) but that still need an admin/management user to post as an
  // actual financeIncome entry — counsellors can't write financeIncome directly.
  const pendingAdmissions = useMemo(
    () => admittedLeads.filter((lead) => (lead.admissionAmountPaid ?? 0) > 0 && !lead.admissionIncomePosted),
    [admittedLeads]
  );

  async function postPendingAdmission(lead: (typeof pendingAdmissions)[number]) {
    if (!user || !canWrite) return;
    setPosting(lead.id);
    try {
      await postAdmissionIncome(lead, { transactionDate: today(), accountingMonth: monthOf(today()) }, user.uid);
      showToast(`Posted ₹${lead.admissionAmountPaid?.toLocaleString("en-IN")} admission fee for ${lead.childName} to Income.`, "success");
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not post this admission payment.", "error");
    } finally {
      setPosting(null);
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const [rows, settled] = await Promise.all([listFinanceEntries(kind), kind === "expense" ? listExpenseSettlements() : Promise.resolve([])]); setEntries(rows); setSettlements(settled); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not load finance entries.", "error"); }
    finally { setLoading(false); }
  }, [kind, showToast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => entries.filter((entry) =>
    entry.status === "posted" && entry.accountingMonth === month &&
    `${entry.title} ${entry.category} ${entry.reference ?? ""} ${entry.notes ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ), [entries, month, search]);
  const total = filtered.reduce((sum, entry) => sum + entry.amount, 0);
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const canWrite = role === "admin" || role === "superadmin" || role === "management";

  async function submitSettlement(event: FormEvent) {
    event.preventDefault();
    if (!user || !canWrite || !settlingEntry) return;
    setSaving(true);
    try { await settleReimbursement({ entry: settlingEntry, settlementDate, paymentMode: settlementMode, reference: settlementReference, uid: user.uid }); showToast("Reimbursement settled and linked to the original expense.", "success"); setSettlingEntry(null); setSettlementReference(""); await refresh(); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not settle reimbursement.", "error"); }
    finally { setSaving(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || !canWrite) return;
    const parsed = Number(amount);
    if (!title.trim() || !Number.isFinite(parsed) || parsed <= 0 || !date) {
      showToast("Enter a description, valid amount and transaction date.", "error");
      return;
    }
    setSaving(true);
    try {
      await addFinanceEntry(kind, {
        title: title.trim(), category, amount: parsed, transactionDate: date,
        accountingMonth: entryMonth, paymentMode: mode,
        // Firestore's addDoc() rejects a literal `undefined` field value outright
        // (distinct from omitting the key) — these are optional fields, so omit
        // them entirely rather than passing `undefined` when left blank.
        ...(reference.trim() && { reference: reference.trim() }),
        ...(notes.trim() && { notes: notes.trim() }),
        linkedLeadId: isIncome ? (linkedLeadId || null) : null, linkedPayrollPaymentId: null, linkedSalaryAdvanceId: null,
        ...(!isIncome && paidBy.trim() && { paidBy: paidBy.trim() }),
      }, user.uid);
      showToast(isIncome ? "Income entry saved." : "Expense entry saved.", "success");
      setTitle(""); setAmount(""); setReference(""); setNotes(""); setShowForm(false);
      setMonth(monthOf(date));
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save entry.", "error");
    } finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
    <SectionHeading eyebrow={isIncome ? "Finance / Receipts" : "Finance / Payments"} title={isIncome ? "Income register" : "Expense register"} description={isIncome ? "Track school fees and other money received, with a clear transaction trail." : "Track school operating costs, management-paid expenses and salary expenses in one register."} />
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><div className="flex items-center justify-between"><span className="text-xs font-medium text-ink-soft">Posted this month</span><Wallet className="h-4 w-4 text-ink-faint"/></div><div className="mt-3 text-2xl font-semibold tracking-tight">{rupees(total)}</div><div className="mt-1 text-xs text-ink-faint">{month}</div></Card>
      <Card><div className="flex items-center justify-between"><span className="text-xs font-medium text-ink-soft">Transactions</span><span className="text-xs text-ink-faint">Count</span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{filtered.length}</div><div className="mt-1 text-xs text-ink-faint">Filtered to selected accounting month</div></Card>
      <Card><div className="flex items-center justify-between"><span className="text-xs font-medium text-ink-soft">Payment modes</span><Wallet className="h-4 w-4 text-ink-faint"/></div><div className="mt-3 text-sm font-semibold">{[...new Set(filtered.map(x => x.paymentMode))].join(" · ") || "No entries yet"}</div><div className="mt-1 text-xs text-ink-faint">Cash, UPI and bank reconciliation support</div></Card>
    </div>
    {isIncome && canWrite && pendingAdmissions.length > 0 && (
      <Card padded={false} className="overflow-hidden border-warn/30">
        <div className="border-b border-border p-4"><h2 className="text-sm font-semibold">Pending from admissions</h2><p className="mt-1 text-xs text-ink-faint">Admission payments a counsellor recorded on the lead but hasn't been posted as income yet — review the amount, then post it.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-bg text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-4 py-3">Child / parent</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Balance due</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3"></th></tr></thead><tbody>{pendingAdmissions.map(lead=><tr key={lead.id} className="border-t border-border-soft"><td className="px-4 py-3"><div className="font-medium text-ink">{lead.childName}</div><div className="mt-0.5 text-xs text-ink-faint">{lead.parentName}</div></td><td className="px-4 py-3 text-ink-soft">{lead.admissionPaymentMode}</td><td className="px-4 py-3 text-ink-soft">{lead.admissionBalanceDueDate?.toDate().toLocaleDateString() ?? "—"}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{rupees(lead.admissionAmountPaid ?? 0)}</td><td className="px-4 py-3 text-right"><Button size="sm" disabled={posting===lead.id} onClick={()=>postPendingAdmission(lead)}>{posting===lead.id?"Posting…":"Post to income"}</Button></td></tr>)}</tbody></table></div>
      </Card>
    )}
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"/><input aria-label="Search entries" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search entries…" className="h-9 w-full rounded-lg border border-border bg-bg pl-9 pr-3 text-sm sm:w-56"/></div>
          <input aria-label="Accounting month" type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm"/>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={()=>void refresh()}><RefreshCw className="h-3.5 w-3.5"/> Refresh</Button>
          <Button variant="secondary" size="sm" onClick={()=>downloadCsv(`${kind}-${month}.csv`,filtered.map(x=>({date:x.transactionDate,accountingMonth:x.accountingMonth,title:x.title,category:x.category,amount:formatAmountForCsv(x.amount),paymentMode:x.paymentMode,paidBy:x.paidBy??"",reference:x.reference??"",linkedLeadId:x.linkedLeadId??"",notes:x.notes??""})))}><Download className="h-3.5 w-3.5"/> Export CSV</Button>
          {canWrite && <Button size="sm" onClick={()=>setShowForm(v=>!v)}><Plus className="h-3.5 w-3.5"/>{isIncome?"Add income":"Add expense"}</Button>}
        </div>
      </div>
      {showForm && canWrite && <form onSubmit={submit} className="grid gap-3 border-b border-border bg-bg/70 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-ink-soft">Description<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder={isIncome?"e.g. April school fees":"e.g. Classroom stationery"} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">Category<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink">{categories.map(c=><option key={c}>{c}</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">Amount (₹)<input required min="1" step="0.01" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">Transaction date<input required type="date" value={date} onChange={e=>{setDate(e.target.value);if(!entryMonth)setEntryMonth(monthOf(e.target.value));}} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">Accounting month<input required type="month" value={entryMonth} onChange={e=>setEntryMonth(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">Payment mode<select value={mode} onChange={e=>setMode(e.target.value as PaymentMode)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink">{MODES.map(m=><option key={m}>{m}</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">Reference (optional)<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Receipt / UTR / voucher no." className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        {isIncome&&<label className="space-y-1 text-xs font-medium text-ink-soft">Link to existing enquiry / child (optional)<select value={linkedLeadId} onChange={e=>setLinkedLeadId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"><option value="">Not linked</option>{admittedLeads.map(lead=><option key={lead.id} value={lead.id}>{lead.parentName} · {lead.childName} · {lead.parentPhone}</option>)}</select></label>}
        {!isIncome&&<label className="space-y-1 text-xs font-medium text-ink-soft">Paid by (optional)<input value={paidBy} onChange={e=>setPaidBy(e.target.value)} placeholder="Management / staff name" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>}
        <label className="space-y-1 text-xs font-medium text-ink-soft sm:col-span-2 lg:col-span-3">Notes (optional)<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Additional details" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={saving}>{saving?"Saving…":"Save entry"}</Button><Button type="button" variant="secondary" onClick={()=>setShowForm(false)}>Cancel</Button></div>
      </form>}
      {settlingEntry&&<form onSubmit={submitSettlement} className="grid gap-3 border-b border-border bg-warn-soft/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4"><h3 className="text-sm font-semibold">Settle management reimbursement</h3><p className="mt-1 text-xs text-ink-faint">{settlingEntry.title} · {settlingEntry.paidBy} · {rupees(settlingEntry.amount)}. This records the settlement separately and does not duplicate the original expense.</p></div>
        <label className="text-xs font-medium text-ink-soft">Settlement date<input required type="date" value={settlementDate} onChange={e=>setSettlementDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <label className="text-xs font-medium text-ink-soft">Paid from<select value={settlementMode} onChange={e=>setSettlementMode(e.target.value as PaymentMode)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink">{MODES.map(m=><option key={m}>{m}</option>)}</select></label>
        <label className="text-xs font-medium text-ink-soft">UTR / reference<input value={settlementReference} onChange={e=>setSettlementReference(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"/></label>
        <div className="flex items-end gap-2"><Button type="submit" disabled={saving}>{saving?"Saving…":"Confirm settlement"}</Button><Button type="button" variant="secondary" onClick={()=>setSettlingEntry(null)}>Cancel</Button></div>
      </form>}
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-bg text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Description</th><th className="px-4 py-3 font-semibold">Category</th><th className="px-4 py-3 font-semibold">Mode</th><th className="px-4 py-3 font-semibold">Reference</th><th className="px-4 py-3 font-semibold">Reimbursement</th><th className="px-4 py-3 text-right font-semibold">Amount</th></tr></thead><tbody>{loading?<tr><td colSpan={7} className="px-4 py-10 text-center text-ink-faint">Loading entries…</td></tr>:filtered.map(entry=><tr key={entry.id} className="border-t border-border-soft transition-colors hover:bg-bg/70"><td className="whitespace-nowrap px-4 py-3 text-xs text-ink-soft">{entry.transactionDate}</td><td className="px-4 py-3"><div className="font-medium text-ink">{entry.title}</div>{entry.notes&&<div className="mt-0.5 max-w-sm truncate text-xs text-ink-faint">{entry.notes}</div>}</td><td className="px-4 py-3 text-ink-soft">{entry.category}</td><td className="px-4 py-3 text-ink-soft">{entry.paymentMode}</td><td className="px-4 py-3 font-mono text-xs text-ink-faint">{entry.reference||"—"}{entry.paidBy&&<div className="mt-1 font-sans text-[10px]">{entry.paidBy}</div>}</td><td className="px-4 py-3">{entry.category==="Reimbursement"&&entry.paidBy?(settlements.some(s=>s.expenseId===entry.id)?<span className="rounded-full bg-good-soft px-2 py-1 text-[10px] font-semibold text-good">Settled</span>:<Button size="sm" variant="secondary" onClick={()=>{setSettlementDate(today());setSettlingEntry(entry);}}>Settle</Button>):<span className="text-xs text-ink-faint">—</span>}</td><td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${isIncome?"text-good":"text-ink"}`}>{isIncome?"+":"−"}{rupees(entry.amount)}</td></tr>)}{!loading&&filtered.length===0&&<tr><td colSpan={7} className="px-4 py-12 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-bg">{isIncome?<ArrowDownLeft className="h-5 w-5 text-ink-faint"/>:<ArrowUpRight className="h-5 w-5 text-ink-faint"/>}</div><div className="mt-3 text-sm font-semibold">No entries for this month</div><div className="mt-1 text-xs text-ink-faint">Change the month or add the first entry.</div></td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between border-t border-border bg-bg/50 px-4 py-3 text-xs"><span className="text-ink-faint">{filtered.length} entries</span><span className="font-semibold tabular-nums">Total: {rupees(total)}</span></div>
    </Card>
    <p className="text-xs leading-5 text-ink-faint">Accounting month is recorded separately from the transaction date so backdated receipts and expenses can be assigned to the correct reporting period. Payroll expenses are posted with a canonical payroll payment reference; do not enter the same salary manually here.</p>
  </div>;
}

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { FilterBar, EMPTY_FILTERS, applyFilters } from "@/components/FilterBar";
import { StatusPill, PriorityPill, FollowUpPill } from "@/components/Pills";
import { computeAttentionFlags } from "@/utils/attention";
import { deriveFollowUpState } from "@/utils/followUp";
import { downloadCsv } from "@/utils/csv";
import { Button } from "@/components/ui";

const QUICK_VIEWS = ["All", "My Leads", "Follow-up Today", "Overdue", "Visits", "Converted", "Needs Attention"] as const;
type QuickView = (typeof QUICK_VIEWS)[number];

function matchesQuickView(view: QuickView, lead: ReturnType<typeof useLeads>["leads"][number], uid: string | undefined): boolean {
  if (view === "My Leads") return !!uid && lead.assignedStaffId === uid;
  if (view === "Follow-up Today") return deriveFollowUpState(lead.nextFollowUpAt) === "Due Today";
  if (view === "Overdue") return deriveFollowUpState(lead.nextFollowUpAt) === "Overdue";
  if (view === "Visits") return ["Visit Scheduled", "Visit Completed"].includes(lead.status);
  if (view === "Converted") return lead.status === "Admission Confirmed";
  return true;
}

export function Leads() {
  const { user } = useAuth();
  const { leads, loading } = useLeads();
  const { programName, staffName } = useLookups();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const viewParam = searchParams.get("view");
  const initialView = viewParam === "attention" ? "Needs Attention" : QUICK_VIEWS.includes(viewParam as QuickView) ? viewParam as QuickView : "All";
  const [quickView, setQuickView] = useState<QuickView>(initialView);

  const filtered = useMemo(() => applyFilters(leads, filters), [leads, filters]);
  const attentionLeadIds = useMemo(() => new Set(computeAttentionFlags(filtered).map((f) => f.lead.id)), [filtered]);
  const visible = useMemo(() => {
    const base = filtered.filter((lead) => matchesQuickView(quickView, lead, user?.uid));
    return quickView === "Needs Attention" ? base.filter((l) => attentionLeadIds.has(l.id)) : base;
  }, [filtered, quickView, user?.uid, attentionLeadIds]);

  const chooseView = (view: QuickView) => {
    setQuickView(view);
    if (view === "Needs Attention") setSearchParams({ view: "attention" });
    else setSearchParams(view === "All" ? {} : { view });
  };

  const exportCsv = () => downloadCsv("leads.csv", visible.map((l) => ({
    parentName: l.parentName, parentPhone: l.parentPhone, childName: l.childName,
    program: programName(l.interestedProgramId), source: l.sourceChannel, status: l.status,
    priority: l.priority, assignedStaff: staffName(l.assignedStaffId),
    nextFollowUpAt: l.nextFollowUpAt?.toDate().toISOString() ?? "", createdAt: l.createdAt?.toDate().toISOString() ?? "",
  })));

  if (loading) return <div className="max-w-7xl mx-auto animate-pulse"><div className="h-8 w-40 bg-surface-2 rounded-lg" /><div className="h-4 w-64 bg-surface-2 rounded mt-2 mb-6" /><div className="h-28 bg-surface border border-border rounded-2xl" /></div>;

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent mb-1">Admissions pipeline</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-ink-soft mt-1">Track every enquiry, owner and next action without losing follow-ups.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          <Link to="/leads/new"><Button className="w-full">+ New Lead</Button></Link>
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
          {QUICK_VIEWS.map((view) => {
            const count = view === "Needs Attention" ? attentionLeadIds.size : filtered.filter((l) => matchesQuickView(view, l, user?.uid)).length;
            return <button key={view} type="button" onClick={() => chooseView(view)} className={`shrink-0 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${quickView === view ? (view === "Needs Attention" ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent-strong") : "text-ink-soft hover:bg-surface-2"}`}>{view} <span className="opacity-70">{count}</span></button>;
          })}
        </div>
        <div className="text-xs text-ink-faint shrink-0">Showing <span className="font-semibold text-ink-soft">{visible.length}</span> of {leads.length}</div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-surface-2/70 text-ink-faint text-[11px] uppercase tracking-wide"><tr><th className="text-left px-5 py-3">Parent / Child</th><th className="text-left px-4 py-3">Program</th><th className="text-left px-4 py-3">Source</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Priority</th><th className="text-left px-4 py-3">Follow-up</th><th className="text-left px-4 py-3">Staff</th></tr></thead>
            <tbody>{visible.map((lead) => <tr key={lead.id} className="border-t border-border-soft hover:bg-surface-2/60 transition-colors"><td className="px-5 py-3.5"><Link to={`/leads/${lead.id}`} className="font-semibold text-ink hover:text-accent">{lead.parentName}</Link><div className="text-ink-faint text-xs mt-0.5">{lead.childName} · {lead.parentPhone}</div></td><td className="px-4 py-3.5">{programName(lead.interestedProgramId)}</td><td className="px-4 py-3.5 text-ink-soft">{lead.sourceChannel}</td><td className="px-4 py-3.5"><StatusPill status={lead.status} /></td><td className="px-4 py-3.5"><PriorityPill priority={lead.priority} /></td><td className="px-4 py-3.5"><FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} /></td><td className="px-4 py-3.5 text-ink-soft">{staffName(lead.assignedStaffId)}</td></tr>)}</tbody>
          </table>
        </div>

        <div className="lg:hidden divide-y divide-border-soft">{visible.map((lead) => <Link key={lead.id} to={`/leads/${lead.id}`} className="block p-4 hover:bg-surface-2 active:bg-surface-2 transition-colors"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-ink truncate">{lead.parentName}</div><div className="text-xs text-ink-soft mt-0.5 truncate">{lead.childName} · {lead.parentPhone}</div></div><StatusPill status={lead.status} /></div><div className="flex flex-wrap items-center gap-2 mt-3"><PriorityPill priority={lead.priority} /><FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} /><span className="text-xs text-ink-soft">{programName(lead.interestedProgramId)}</span></div><div className="text-xs text-ink-faint mt-2">{lead.sourceChannel} · {staffName(lead.assignedStaffId)}</div></Link>)}</div>
        {visible.length === 0 && <div className="px-4 py-12 text-center"><div className="font-semibold text-ink">No leads found</div><p className="text-sm text-ink-faint mt-1">Try clearing a filter or changing your search.</p><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); chooseView("All"); }} className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong">Clear filters →</button></div>}
      </div>
    </div>
  );
}

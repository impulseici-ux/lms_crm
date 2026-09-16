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

  if (loading) return <div className="text-ink-soft">Loading leads…</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div><h1 className="font-display text-2xl font-semibold">Leads</h1><p className="text-sm text-ink-soft mt-1">Track every enquiry and its next action.</p></div>
        <div className="grid grid-cols-2 sm:flex gap-2"><Button variant="secondary" onClick={exportCsv}>Export CSV</Button><Link to="/leads/new"><Button className="w-full">New Lead</Button></Link></div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
        {QUICK_VIEWS.map((view) => {
          const count = view === "Needs Attention" ? attentionLeadIds.size : filtered.filter((l) => matchesQuickView(view, l, user?.uid)).length;
          return <button key={view} type="button" onClick={() => chooseView(view)} className={`shrink-0 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-full ${quickView === view ? (view === "Needs Attention" ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent-strong") : "text-ink-soft hover:bg-surface-2"}`}>{view} ({count})</button>;
        })}
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-surface-2 text-ink-faint text-xs uppercase"><tr><th className="text-left px-4 py-3">Parent / Child</th><th className="text-left px-4 py-3">Program</th><th className="text-left px-4 py-3">Source</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Priority</th><th className="text-left px-4 py-3">Follow-up</th><th className="text-left px-4 py-3">Staff</th></tr></thead>
            <tbody>{visible.map((lead) => <tr key={lead.id} className="border-t border-border-soft hover:bg-surface-2"><td className="px-4 py-3"><Link to={`/leads/${lead.id}`} className="font-semibold text-ink hover:text-accent">{lead.parentName}</Link><div className="text-ink-faint text-xs">{lead.childName} · {lead.parentPhone}</div></td><td className="px-4 py-3">{programName(lead.interestedProgramId)}</td><td className="px-4 py-3 text-ink-soft">{lead.sourceChannel}</td><td className="px-4 py-3"><StatusPill status={lead.status} /></td><td className="px-4 py-3"><PriorityPill priority={lead.priority} /></td><td className="px-4 py-3"><FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} /></td><td className="px-4 py-3 text-ink-soft">{staffName(lead.assignedStaffId)}</td></tr>)}</tbody>
          </table>
        </div>

        <div className="lg:hidden divide-y divide-border-soft">{visible.map((lead) => <Link key={lead.id} to={`/leads/${lead.id}`} className="block p-4 hover:bg-surface-2 active:bg-surface-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-ink truncate">{lead.parentName}</div><div className="text-xs text-ink-soft mt-0.5 truncate">{lead.childName} · {lead.parentPhone}</div></div><StatusPill status={lead.status} /></div><div className="flex flex-wrap items-center gap-2 mt-3"><PriorityPill priority={lead.priority} /><FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} /><span className="text-xs text-ink-soft">{programName(lead.interestedProgramId)}</span></div><div className="text-xs text-ink-faint mt-2">{lead.sourceChannel} · {staffName(lead.assignedStaffId)}</div></Link>)}</div>
        {visible.length === 0 && <div className="px-4 py-10 text-center text-sm text-ink-faint">No leads match this view and its filters.</div>}
      </div>
    </div>
  );
}

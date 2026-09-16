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
import { Button, EmptyState, SectionHeading, SegmentedControl, Skeleton } from "@/components/ui";
import { UserPlus, Download, Inbox, Phone } from "lucide-react";

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Leads() {
  const { user } = useAuth();
  const { leads, loading } = useLeads();
  const { programName, staffName } = useLookups();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const viewParam = searchParams.get("view");
  const initialView = viewParam === "attention" ? "Needs Attention" : QUICK_VIEWS.includes(viewParam as QuickView) ? (viewParam as QuickView) : "All";
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

  const exportCsv = () =>
    downloadCsv(
      "leads.csv",
      visible.map((l) => ({
        parentName: l.parentName,
        parentPhone: l.parentPhone,
        childName: l.childName,
        program: programName(l.interestedProgramId),
        source: l.sourceChannel,
        status: l.status,
        priority: l.priority,
        assignedStaff: staffName(l.assignedStaffId),
        nextFollowUpAt: l.nextFollowUpAt?.toDate().toISOString() ?? "",
        createdAt: l.createdAt?.toDate().toISOString() ?? "",
      }))
    );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <Skeleton className="h-9 w-40 mb-2" />
        <Skeleton className="h-4 w-72 mb-6" />
        <Skeleton className="h-32 rounded-2xl mb-5" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const segments = QUICK_VIEWS.map((view) => ({
    value: view,
    label: view,
    count: view === "Needs Attention" ? attentionLeadIds.size : filtered.filter((l) => matchesQuickView(view, l, user?.uid)).length,
    tone: view === "Needs Attention" ? ("bad" as const) : ("accent" as const),
  }));

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <SectionHeading
        eyebrow="Admissions pipeline"
        title="Leads"
        description="Track every enquiry, owner and next action without losing follow-ups."
        action={
          <div className="grid grid-cols-2 sm:flex gap-2">
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="w-4 h-4" /> Export
            </Button>
            <Link to="/leads/new">
              <Button className="w-full">
                <UserPlus className="w-4 h-4" /> New Lead
              </Button>
            </Link>
          </div>
        }
      />

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <SegmentedControl options={segments} value={quickView} onChange={chooseView} />
        <div className="text-xs text-ink-faint shrink-0">
          Showing <span className="font-semibold text-ink-soft">{visible.length}</span> of {leads.length}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-ink-faint text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Parent / Child</th>
                <th className="text-left px-4 py-3">Program</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Priority</th>
                <th className="text-left px-4 py-3">Follow-up</th>
                <th className="text-left px-4 py-3">Staff</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lead) => (
                <tr key={lead.id} className="border-t border-border-soft hover:bg-surface-2/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center text-[11px] font-bold shrink-0">
                        {initials(lead.parentName)}
                      </div>
                      <div className="min-w-0">
                        <Link to={`/leads/${lead.id}`} className="font-semibold text-ink hover:text-accent">
                          {lead.parentName}
                        </Link>
                        <div className="text-ink-faint text-xs mt-0.5 flex items-center gap-1">
                          <span className="truncate">{lead.childName}</span>
                          <span>·</span>
                          <Phone className="w-3 h-3" />
                          <span>{lead.parentPhone}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft">{programName(lead.interestedProgramId)}</td>
                  <td className="px-4 py-3.5 text-ink-soft">{lead.sourceChannel}</td>
                  <td className="px-4 py-3.5"><StatusPill status={lead.status} /></td>
                  <td className="px-4 py-3.5"><PriorityPill priority={lead.priority} /></td>
                  <td className="px-4 py-3.5"><FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} /></td>
                  <td className="px-4 py-3.5 text-ink-soft">{staffName(lead.assignedStaffId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden divide-y divide-border-soft">
          {visible.map((lead) => (
            <Link key={lead.id} to={`/leads/${lead.id}`} className="block p-4 hover:bg-surface-2 active:bg-surface-2 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center text-[12px] font-bold shrink-0">
                    {initials(lead.parentName)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink truncate">{lead.parentName}</div>
                    <div className="text-xs text-ink-soft mt-0.5 truncate">{lead.childName} · {lead.parentPhone}</div>
                  </div>
                </div>
                <StatusPill status={lead.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <PriorityPill priority={lead.priority} />
                <FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} />
                <span className="text-xs text-ink-soft">{programName(lead.interestedProgramId)}</span>
              </div>
              <div className="text-xs text-ink-faint mt-2">{lead.sourceChannel} · {staffName(lead.assignedStaffId)}</div>
            </Link>
          ))}
        </div>

        {visible.length === 0 && (
          <EmptyState
            icon={<Inbox />}
            title="No leads found"
            description="Try clearing a filter, changing your search, or switching views."
            action={
              <button
                type="button"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  chooseView("All");
                }}
                className="text-xs font-semibold text-accent hover:text-accent-strong"
              >
                Clear filters →
              </button>
            }
          />
        )}
      </div>
    </div>
  );
}

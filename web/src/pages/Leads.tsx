import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { FilterBar, EMPTY_FILTERS, applyFilters } from "@/components/FilterBar";
import { StatusPill, PriorityPill, FollowUpPill } from "@/components/Pills";
import { computeAttentionFlags } from "@/utils/attention";
import { downloadCsv } from "@/utils/csv";
import { Button } from "@/components/ui";

export function Leads() {
  const { leads, loading } = useLeads();
  const { programName, staffName } = useLookups();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [onlyAttention, setOnlyAttention] = useState(false);

  const filtered = useMemo(() => applyFilters(leads, filters), [leads, filters]);
  const attentionLeadIds = useMemo(
    () => new Set(computeAttentionFlags(filtered).map((f) => f.lead.id)),
    [filtered]
  );
  const visible = onlyAttention ? filtered.filter((l) => attentionLeadIds.has(l.id)) : filtered;

  const exportCsv = () => {
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
  };

  if (loading) return <div className="text-ink-soft">Loading leads…</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-ink-soft mt-1">Track every enquiry and its next action.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          <Link to="/leads/new"><Button className="w-full">New Lead</Button></Link>
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="flex items-center gap-2 mb-3 overflow-x-auto">
        <button
          onClick={() => setOnlyAttention(false)}
          className={`shrink-0 text-sm font-semibold px-3 py-1.5 rounded-full ${!onlyAttention ? "bg-accent-soft text-accent-strong" : "text-ink-soft hover:bg-surface-2"}`}
        >
          All ({filtered.length})
        </button>
        <button
          onClick={() => setOnlyAttention(true)}
          className={`shrink-0 text-sm font-semibold px-3 py-1.5 rounded-full ${onlyAttention ? "bg-bad-soft text-bad" : "text-ink-soft hover:bg-surface-2"}`}
        >
          Needs Attention ({attentionLeadIds.size})
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-faint text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Parent / Child</th>
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
                <tr key={lead.id} className="border-t border-border-soft hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link to={`/leads/${lead.id}`} className="font-semibold text-ink hover:text-accent">
                      {lead.parentName}
                    </Link>
                    <div className="text-ink-faint text-xs">{lead.childName} · {lead.parentPhone}</div>
                  </td>
                  <td className="px-4 py-3">{programName(lead.interestedProgramId)}</td>
                  <td className="px-4 py-3 text-ink-soft">{lead.sourceChannel}</td>
                  <td className="px-4 py-3"><StatusPill status={lead.status} /></td>
                  <td className="px-4 py-3"><PriorityPill priority={lead.priority} /></td>
                  <td className="px-4 py-3"><FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} /></td>
                  <td className="px-4 py-3 text-ink-soft">{staffName(lead.assignedStaffId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden divide-y divide-border-soft">
          {visible.map((lead) => (
            <Link
              key={lead.id}
              to={`/leads/${lead.id}`}
              className="block p-4 hover:bg-surface-2 active:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink truncate">{lead.parentName}</div>
                  <div className="text-xs text-ink-soft mt-0.5 truncate">{lead.childName} · {lead.parentPhone}</div>
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
          <div className="px-4 py-10 text-center text-sm text-ink-faint">No leads match these filters.</div>
        )}
      </div>
    </div>
  );
}

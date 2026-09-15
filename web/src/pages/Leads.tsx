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
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Leads</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          <Link to="/leads/new"><Button>New Lead</Button></Link>
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setOnlyAttention(false)}
          className={`text-sm font-semibold px-3 py-1.5 rounded-full ${!onlyAttention ? "bg-accent-soft text-accent-strong" : "text-ink-soft"}`}
        >
          All ({filtered.length})
        </button>
        <button
          onClick={() => setOnlyAttention(true)}
          className={`text-sm font-semibold px-3 py-1.5 rounded-full ${onlyAttention ? "bg-bad-soft text-bad" : "text-ink-soft"}`}
        >
          Needs Attention ({attentionLeadIds.size})
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
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
              <tr
                key={lead.id}
                className="border-t border-border-soft hover:bg-surface-2 cursor-pointer"
                onClick={() => (window.location.href = `/leads/${lead.id}`)}
              >
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
            {visible.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-faint">No leads match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { BigStat, Card } from "@/components/ui";
import { computeHeadlineMetrics, breakdownBySource, breakdownByStaff } from "@/utils/metrics";
import { computeAttentionFlags, ATTENTION_RULE_LABELS } from "@/utils/attention";
import { StatusPill } from "@/components/Pills";

export function Dashboard() {
  const { leads, loading } = useLeads();
  const { staffName } = useLookups();

  if (loading) return <div className="text-ink-soft">Loading dashboard…</div>;

  const metrics = computeHeadlineMetrics(leads);
  const bySource = breakdownBySource(leads);
  const byStaff = breakdownByStaff(leads);
  const attentionFlags = computeAttentionFlags(leads);

  const flagsByLead = new Map<string, typeof attentionFlags>();
  for (const flag of attentionFlags) {
    if (!flagsByLead.has(flag.lead.id)) flagsByLead.set(flag.lead.id, []);
    flagsByLead.get(flag.lead.id)!.push(flag);
  }
  const attentionLeads = Array.from(flagsByLead.entries()).slice(0, 12);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-ink-soft mt-1">Admissions pipeline at a glance.</p>
        </div>
        <Link to="/leads/new" className="inline-flex items-center justify-center rounded-lg bg-accent text-white px-4 py-2.5 text-sm font-semibold hover:bg-accent-strong">
          + New Lead
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-6">
        <BigStat value={metrics.totalLeadsThisMonth} label="Leads this month" />
        <BigStat value={metrics.newLeadsToday} label="New today" />
        <BigStat value={metrics.visitsScheduled} label="Visits scheduled" />
        <BigStat value={metrics.overdueFollowUps} label="Overdue follow-ups" color="var(--color-bad)" />
        <BigStat value={metrics.todayFollowUps} label="Follow-ups today" color="var(--color-warn)" />
        <BigStat value={metrics.admissionsConfirmedThisMonth} label="Admissions this month" color="var(--color-good)" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Link to="/leads?view=attention" className="rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 hover:border-bad/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-bad">Needs attention</div>
          <div className="font-display text-2xl font-semibold mt-1">{attentionLeads.length}</div>
        </Link>
        <Link to="/leads" className="rounded-xl border border-border bg-surface px-4 py-3 hover:border-accent/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Total pipeline</div>
          <div className="font-display text-2xl font-semibold mt-1">{leads.length}</div>
        </Link>
        <Link to="/reports" className="rounded-xl border border-border bg-surface px-4 py-3 hover:border-accent/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Reports</div>
          <div className="text-sm font-semibold mt-2 text-accent">View performance →</div>
        </Link>
        <Link to="/leads" className="rounded-xl border border-border bg-surface px-4 py-3 hover:border-accent/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Today</div>
          <div className="text-sm font-semibold mt-2 text-accent">Open lead list →</div>
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Lead source breakdown</h2>
            <Link to="/reports" className="text-xs font-semibold text-accent hover:text-accent-strong">Reports →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-ink-faint text-xs uppercase">
                  <th className="pb-2">Source</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {bySource.slice(0, 8).map((row) => (
                  <tr key={row.key} className="border-t border-border-soft">
                    <td className="py-2">{row.key}</td><td className="py-2 text-right">{row.total}</td><td className="py-2 text-right">{(row.conversionRate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Staff performance</h2>
            <Link to="/reports" className="text-xs font-semibold text-accent hover:text-accent-strong">Reports →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[430px]">
              <thead>
                <tr className="text-left text-ink-faint text-xs uppercase">
                  <th className="pb-2">Staff</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Overdue</th><th className="pb-2 text-right">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {byStaff.map((row) => (
                  <tr key={row.key} className="border-t border-border-soft">
                    <td className="py-2">{staffName(row.key === "—" ? null : row.key)}</td><td className="py-2 text-right">{row.total}</td><td className="py-2 text-right text-bad">{row.overdue}</td><td className="py-2 text-right">{(row.conversionRate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div>
            <h2 className="font-semibold">Attention / Leakage</h2>
            <p className="text-xs text-ink-faint mt-0.5">Leads that may need immediate action.</p>
          </div>
          <span className="text-xs text-ink-faint">{attentionFlags.length} flags · {attentionLeads.length} leads shown</span>
        </div>
        {attentionLeads.length === 0 ? (
          <p className="text-sm text-ink-soft py-3">Nothing needs attention right now.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {attentionLeads.map(([leadId, flags]) => (
              <Link key={leadId} to={`/leads/${leadId}`} className="flex items-center justify-between gap-3 py-3 hover:bg-surface-2 -mx-2 px-2 rounded-lg">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{flags[0].lead.parentName} · {flags[0].lead.childName}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {flags.map((f) => <span key={f.rule} className="text-[11px] font-semibold bg-bad-soft text-bad rounded-full px-2 py-0.5">{ATTENTION_RULE_LABELS[f.rule]}</span>)}
                  </div>
                </div>
                <StatusPill status={flags[0].lead.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

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
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <BigStat value={metrics.totalLeadsThisMonth} label="Total Leads (this month)" />
        <BigStat value={metrics.newLeadsToday} label="New Leads (today)" />
        <BigStat value={metrics.visitsScheduled} label="Visits Scheduled" />
        <BigStat value={metrics.overdueFollowUps} label="Overdue Follow-ups" color="var(--color-bad)" />
        <BigStat value={metrics.todayFollowUps} label="Today's Follow-ups" color="var(--color-warn)" />
        <BigStat value={metrics.admissionsConfirmedThisMonth} label="Admissions Confirmed (this month)" color="var(--color-good)" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <h2 className="font-semibold mb-3">Lead source breakdown</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-xs uppercase">
                <th className="pb-2">Source</th>
                <th className="pb-2 text-right">Leads</th>
                <th className="pb-2 text-right">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {bySource.slice(0, 8).map((row) => (
                <tr key={row.key} className="border-t border-border-soft">
                  <td className="py-2">{row.key}</td>
                  <td className="py-2 text-right">{row.total}</td>
                  <td className="py-2 text-right">{(row.conversionRate * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="font-semibold mb-3">Staff performance</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-xs uppercase">
                <th className="pb-2">Staff</th>
                <th className="pb-2 text-right">Leads</th>
                <th className="pb-2 text-right">Overdue</th>
                <th className="pb-2 text-right">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {byStaff.map((row) => (
                <tr key={row.key} className="border-t border-border-soft">
                  <td className="py-2">{staffName(row.key === "—" ? null : row.key)}</td>
                  <td className="py-2 text-right">{row.total}</td>
                  <td className="py-2 text-right text-bad">{row.overdue}</td>
                  <td className="py-2 text-right">{(row.conversionRate * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Attention / Leakage</h2>
          <span className="text-xs text-ink-faint">{attentionFlags.length} flags across {attentionLeads.length} leads shown</span>
        </div>
        {attentionLeads.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing needs attention right now.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {attentionLeads.map(([leadId, flags]) => (
              <Link
                key={leadId}
                to={`/leads/${leadId}`}
                className="flex items-center justify-between py-3 hover:bg-surface-2 -mx-2 px-2 rounded-lg"
              >
                <div>
                  <div className="font-semibold text-sm">{flags[0].lead.parentName} · {flags[0].lead.childName}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {flags.map((f) => (
                      <span key={f.rule} className="text-[11px] font-semibold bg-bad-soft text-bad rounded-full px-2 py-0.5">
                        {ATTENTION_RULE_LABELS[f.rule]}
                      </span>
                    ))}
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

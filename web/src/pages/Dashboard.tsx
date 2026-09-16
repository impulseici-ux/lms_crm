import { Link } from "react-router-dom";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { BigStat, Card } from "@/components/ui";
import { computeHeadlineMetrics, breakdownBySource, breakdownByStaff } from "@/utils/metrics";
import { computeAttentionFlags, ATTENTION_RULE_LABELS } from "@/utils/attention";
import { StatusPill } from "@/components/Pills";

const statLinks = [
  { label: "Leads this month", key: "month", tone: "accent" },
  { label: "New today", key: "today", tone: "accent" },
  { label: "Visits scheduled", key: "visits", tone: "accent" },
  { label: "Overdue follow-ups", key: "overdue", tone: "bad" },
  { label: "Follow-ups today", key: "followups", tone: "warn" },
  { label: "Admissions this month", key: "admissions", tone: "good" },
] as const;

export function Dashboard() {
  const { leads, loading } = useLeads();
  const { staffName } = useLookups();

  if (loading) return <div className="max-w-7xl mx-auto animate-pulse"><div className="h-8 w-48 bg-surface-2 rounded-lg" /><div className="h-4 w-72 bg-surface-2 rounded mt-2 mb-6" /><div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3"><div className="h-28 bg-surface rounded-xl border border-border" /><div className="h-28 bg-surface rounded-xl border border-border" /><div className="h-28 bg-surface rounded-xl border border-border" /><div className="h-28 bg-surface rounded-xl border border-border" /><div className="h-28 bg-surface rounded-xl border border-border" /><div className="h-28 bg-surface rounded-xl border border-border" /></div></div>;

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

  const statValue: Record<(typeof statLinks)[number]["key"], number> = {
    month: metrics.totalLeadsThisMonth,
    today: metrics.newLeadsToday,
    visits: metrics.visitsScheduled,
    overdue: metrics.overdueFollowUps,
    followups: metrics.todayFollowUps,
    admissions: metrics.admissionsConfirmedThisMonth,
  };
  const statHref: Record<(typeof statLinks)[number]["key"], string> = {
    month: "/leads", today: "/leads?view=All", visits: "/leads?view=Visits",
    overdue: "/leads?view=Overdue", followups: "/leads?view=Follow-up%20Today", admissions: "/leads?view=Converted",
  };

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <div className="relative overflow-hidden rounded-2xl bg-accent text-white p-5 sm:p-7 mb-6 shadow-sm">
        <div className="absolute -right-12 -top-16 w-44 h-44 rounded-full border-[28px] border-white/10" />
        <div className="absolute right-20 -bottom-24 w-48 h-48 rounded-full border-[34px] border-white/5" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 mb-2">Admissions control centre</div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Good day. Here's your pipeline.</h1>
            <p className="text-sm text-white/75 mt-2 max-w-xl">Stay on top of new enquiries, follow-ups, visits and admissions from one place.</p>
          </div>
          <Link to="/leads/new" className="inline-flex items-center justify-center rounded-lg bg-white text-accent px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-white/90 shrink-0">+ New Lead</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-6">
        {statLinks.map((stat) => (
          <Link key={stat.key} to={statHref[stat.key]} className="group block">
            <BigStat value={statValue[stat.key]} label={stat.label} color={stat.tone === "bad" ? "var(--color-bad)" : stat.tone === "warn" ? "var(--color-warn)" : stat.tone === "good" ? "var(--color-good)" : undefined} />
            <div className="-mt-2 mx-4 h-0.5 rounded-full bg-border-soft group-hover:bg-accent transition-colors" />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Link to="/leads?view=attention" className="rounded-xl border border-bad/20 bg-bad-soft px-4 py-3.5 hover:border-bad/40 transition-colors">
          <div className="flex items-center justify-between"><div className="text-[11px] font-bold uppercase tracking-wide text-bad">Needs attention</div><span className="text-bad">!</span></div>
          <div className="font-display text-2xl font-semibold mt-1">{attentionLeads.length}</div>
          <div className="text-xs text-bad/80 mt-0.5">Open priority items →</div>
        </Link>
        <Link to="/leads" className="rounded-xl border border-border bg-surface px-4 py-3.5 hover:border-accent/40 transition-colors">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Total pipeline</div>
          <div className="font-display text-2xl font-semibold mt-1">{leads.length}</div>
          <div className="text-xs text-ink-faint mt-0.5">Browse all leads →</div>
        </Link>
        <Link to="/reports" className="rounded-xl border border-border bg-surface px-4 py-3.5 hover:border-accent/40 transition-colors">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Performance</div>
          <div className="font-display text-lg font-semibold mt-2 text-accent">Source & staff reports</div>
          <div className="text-xs text-ink-faint mt-0.5">Analyse conversion →</div>
        </Link>
        <Link to="/leads?view=Follow-up%20Today" className="rounded-xl border border-border bg-surface px-4 py-3.5 hover:border-accent/40 transition-colors">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Next actions</div>
          <div className="font-display text-lg font-semibold mt-2 text-accent">{metrics.todayFollowUps + metrics.overdueFollowUps} due</div>
          <div className="text-xs text-ink-faint mt-0.5">Today + overdue →</div>
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="overflow-hidden p-0">
          <div className="p-5 pb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Lead source breakdown</h2><p className="text-xs text-ink-faint mt-1">Where your enquiries are coming from</p></div><Link to="/reports" className="text-xs font-semibold text-accent hover:text-accent-strong">Reports →</Link></div>
          <div className="overflow-x-auto px-5 pb-4"><table className="w-full text-sm min-w-[420px]"><thead><tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide"><th className="pb-2">Source</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Conversion</th></tr></thead><tbody>{bySource.slice(0, 8).map((row) => <tr key={row.key} className="border-t border-border-soft"><td className="py-2.5 font-medium">{row.key}</td><td className="py-2.5 text-right font-semibold">{row.total}</td><td className="py-2.5 text-right">{(row.conversionRate * 100).toFixed(0)}%</td></tr>)}</tbody></table></div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="p-5 pb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Staff performance</h2><p className="text-xs text-ink-faint mt-1">Ownership and conversion snapshot</p></div><Link to="/reports" className="text-xs font-semibold text-accent hover:text-accent-strong">Reports →</Link></div>
          <div className="overflow-x-auto px-5 pb-4"><table className="w-full text-sm min-w-[430px]"><thead><tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide"><th className="pb-2">Staff</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Overdue</th><th className="pb-2 text-right">Conversion</th></tr></thead><tbody>{byStaff.map((row) => <tr key={row.key} className="border-t border-border-soft"><td className="py-2.5 font-medium">{staffName(row.key === "—" ? null : row.key)}</td><td className="py-2.5 text-right font-semibold">{row.total}</td><td className="py-2.5 text-right text-bad">{row.overdue}</td><td className="py-2.5 text-right">{(row.conversionRate * 100).toFixed(0)}%</td></tr>)}</tbody></table></div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><h2 className="font-semibold">Attention / Leakage</h2><p className="text-xs text-ink-faint mt-1">Leads that may need immediate action.</p></div><span className="text-xs text-ink-faint">{attentionFlags.length} flags · {attentionLeads.length} leads shown</span></div>
        {attentionLeads.length === 0 ? <div className="mx-5 mb-5 rounded-xl border border-good/20 bg-good-soft px-4 py-5 text-center"><div className="font-semibold text-good">Everything looks clear</div><p className="text-xs text-good/80 mt-1">No attention flags are currently active.</p></div> : <div className="divide-y divide-border-soft">{attentionLeads.map(([leadId, flags]) => <Link key={leadId} to={`/leads/${leadId}`} className="flex items-center justify-between gap-3 py-3.5 px-5 hover:bg-surface-2 transition-colors"><div className="min-w-0"><div className="font-semibold text-sm truncate">{flags[0].lead.parentName} <span className="text-ink-faint font-normal">·</span> {flags[0].lead.childName}</div><div className="flex flex-wrap gap-1.5 mt-1">{flags.map((f) => <span key={f.rule} className="text-[11px] font-semibold bg-bad-soft text-bad rounded-full px-2 py-0.5">{ATTENTION_RULE_LABELS[f.rule]}</span>)}</div></div><StatusPill status={flags[0].lead.status} /></Link>)}</div>}
      </Card>
    </div>
  );
}

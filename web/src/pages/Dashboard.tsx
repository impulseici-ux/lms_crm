import { Link } from "react-router-dom";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { BigStat, Card, ProgressBar, EmptyState } from "@/components/ui";
import { computeHeadlineMetrics, breakdownBySource, breakdownByStaff, stageFunnel } from "@/utils/metrics";
import { computeAttentionFlags, ATTENTION_RULE_LABELS } from "@/utils/attention";
import { StatusPill } from "@/components/Pills";
import {
  Users,
  UserPlus,
  CalendarCheck,
  AlertTriangle,
  Clock,
  GraduationCap,
  ArrowUpRight,
  Radio,
  UserCog,
  ShieldCheck,
} from "lucide-react";

interface StatConfig {
  key: "month" | "today" | "visits" | "overdue" | "followups" | "admissions";
  label: string;
  icon: typeof Users;
  href: string;
  color?: string;
}

const statConfig: StatConfig[] = [
  { key: "month", label: "This month", icon: Users, href: "/leads" },
  { key: "today", label: "New today", icon: UserPlus, href: "/leads?view=All" },
  { key: "visits", label: "Visits", icon: CalendarCheck, href: "/leads?view=Visits" },
  { key: "overdue", label: "Overdue", icon: AlertTriangle, href: "/leads?view=Overdue", color: "var(--color-bad)" },
  { key: "followups", label: "Due today", icon: Clock, href: "/leads?view=Follow-up%20Today", color: "var(--color-warn)" },
  { key: "admissions", label: "Admissions", icon: GraduationCap, href: "/leads?view=Converted", color: "var(--color-good)" },
];

export function Dashboard() {
  const { leads, loading } = useLeads();
  const { staffName } = useLookups();

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto animate-pulse">
        <div className="h-40 bg-surface-2 rounded-2xl mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 bg-surface-2 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const metrics = computeHeadlineMetrics(leads);
  const bySource = breakdownBySource(leads);
  const byStaff = breakdownByStaff(leads);
  const attentionFlags = computeAttentionFlags(leads);
  const funnel = stageFunnel(leads);
  const funnelMax = funnel[0]?.count || 1;

  const flagsByLead = new Map<string, typeof attentionFlags>();
  for (const flag of attentionFlags) {
    if (!flagsByLead.has(flag.lead.id)) flagsByLead.set(flag.lead.id, []);
    flagsByLead.get(flag.lead.id)!.push(flag);
  }
  const attentionLeads = Array.from(flagsByLead.entries()).slice(0, 8);

  const statValue: Record<(typeof statConfig)[number]["key"], number> = {
    month: metrics.totalLeadsThisMonth,
    today: metrics.newLeadsToday,
    visits: metrics.visitsScheduled,
    overdue: metrics.overdueFollowUps,
    followups: metrics.todayFollowUps,
    admissions: metrics.admissionsConfirmedThisMonth,
  };

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <div className="relative overflow-hidden rounded-2xl bg-accent-strong text-white p-6 sm:p-8 mb-6">
        <div className="absolute -right-16 -top-20 w-56 h-56 rounded-full border-[36px] border-white/[0.07]" />
        <div className="absolute right-32 -bottom-28 w-56 h-56 rounded-full border-[40px] border-white/[0.05]" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 mb-2">Admissions control centre</div>
            <h1 className="font-display text-[30px] sm:text-[36px] font-semibold tracking-tight leading-[1.1]">Here's your pipeline today.</h1>
            <p className="text-[14.5px] text-white/70 mt-2.5 max-w-lg">Every enquiry, follow-up, visit and admission — in one view.</p>
          </div>
          <Link to="/leads/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-accent-strong px-5 py-3 text-sm font-bold shadow-lg hover:bg-white/90 shrink-0 transition-colors">
            <UserPlus className="w-4 h-4" /> New Lead
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {statConfig.map((stat) => (
          <Link key={stat.key} to={stat.href} className="block">
            <BigStat value={statValue[stat.key]} label={stat.label} color={stat.color} icon={<stat.icon />} />
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-0 overflow-hidden lg:col-span-2">
          <div className="p-5 pb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-ink">Admissions pipeline</h2>
              <p className="text-xs text-ink-faint mt-1">How far leads have progressed, stage by stage.</p>
            </div>
            <span className="text-xs font-semibold text-ink-faint">{funnelMax} total</span>
          </div>
          <div className="px-5 pb-5 space-y-3">
            {funnel.map((stage, i) => {
              const pct = funnelMax ? (stage.count / funnelMax) * 100 : 0;
              return (
                <div key={stage.stage}>
                  <div className="flex items-baseline justify-between text-[13px] mb-1">
                    <span className="font-medium text-ink">{i + 1}. {stage.stage}</span>
                    <span className="text-ink-faint font-semibold">{stage.count}</span>
                  </div>
                  <ProgressBar value={pct} tone={stage.stage === "Admission Confirmed" ? "good" : "accent"} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-0 overflow-hidden flex flex-col">
          <div className="p-5 pb-3">
            <h2 className="font-semibold text-ink">Needs attention</h2>
            <p className="text-xs text-ink-faint mt-1">Leakage rules flagging right now.</p>
          </div>
          <div className="px-5 pb-5 flex-1 flex flex-col justify-center">
            {attentionFlags.length === 0 ? (
              <div className="rounded-xl border border-good/20 bg-good-soft px-4 py-5 text-center">
                <ShieldCheck className="w-5 h-5 text-good mx-auto mb-2" />
                <div className="font-semibold text-good text-sm">All clear</div>
                <p className="text-xs text-good/80 mt-1">No leakage flags active.</p>
              </div>
            ) : (
              <Link to="/leads?view=attention" className="rounded-xl border border-bad/20 bg-bad-soft px-4 py-4 flex items-center justify-between hover:border-bad/40 transition-colors">
                <div>
                  <div className="text-[28px] font-display font-semibold text-bad leading-none">{attentionLeads.length}</div>
                  <div className="text-xs text-bad/80 mt-1.5">leads flagged · {attentionFlags.length} rule hits</div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-bad" />
              </Link>
            )}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="overflow-hidden p-0">
          <div className="p-5 pb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0"><Radio className="w-4 h-4" /></div>
              <div><h2 className="font-semibold text-ink">Source performance</h2><p className="text-xs text-ink-faint mt-0.5">Where enquiries come from</p></div>
            </div>
            <Link to="/reports" className="text-xs font-semibold text-accent hover:text-accent-strong shrink-0">Reports →</Link>
          </div>
          <div className="px-5 pb-4 space-y-3">
            {bySource.slice(0, 6).map((row) => (
              <div key={row.key}>
                <div className="flex items-center justify-between text-[13px] mb-1">
                  <span className="font-medium text-ink truncate pr-2">{row.key}</span>
                  <span className="text-ink-faint shrink-0"><span className="font-semibold text-ink">{row.total}</span> leads · {(row.conversionRate * 100).toFixed(0)}%</span>
                </div>
                <ProgressBar value={row.conversionRate * 100} />
              </div>
            ))}
            {bySource.length === 0 && <p className="text-sm text-ink-faint py-4 text-center">No leads yet.</p>}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="p-5 pb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0"><UserCog className="w-4 h-4" /></div>
              <div><h2 className="font-semibold text-ink">Staff performance</h2><p className="text-xs text-ink-faint mt-0.5">Ownership and conversion</p></div>
            </div>
            <Link to="/reports" className="text-xs font-semibold text-accent hover:text-accent-strong shrink-0">Reports →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[380px]">
              <thead><tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide"><th className="pb-2 pl-5">Staff</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Overdue</th><th className="pb-2 text-right pr-5">Conv.</th></tr></thead>
              <tbody>
                {byStaff.map((row) => (
                  <tr key={row.key} className="border-t border-border-soft">
                    <td className="py-2.5 pl-5 font-medium">{staffName(row.key === "—" ? null : row.key)}</td>
                    <td className="py-2.5 text-right font-semibold">{row.total}</td>
                    <td className="py-2.5 text-right">{row.overdue > 0 ? <span className="text-bad font-semibold">{row.overdue}</span> : <span className="text-ink-faint">0</span>}</td>
                    <td className="py-2.5 text-right pr-5">{(row.conversionRate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {byStaff.length === 0 && <p className="text-sm text-ink-faint py-4 text-center">No staff data yet.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div><h2 className="font-semibold text-ink">Attention / Leakage detail</h2><p className="text-xs text-ink-faint mt-1">Individual leads behind the summary above.</p></div>
          <span className="text-xs text-ink-faint">{attentionFlags.length} flags · {attentionLeads.length} shown</span>
        </div>
        {attentionLeads.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="Nothing needs attention right now" description="Every open lead has a scheduled, on-time follow-up." />
        ) : (
          <div className="divide-y divide-border-soft">
            {attentionLeads.map(([leadId, flags]) => (
              <Link key={leadId} to={`/leads/${leadId}`} className="flex items-center justify-between gap-3 py-3.5 px-5 hover:bg-surface-2 transition-colors">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{flags[0].lead.parentName} <span className="text-ink-faint font-normal">·</span> {flags[0].lead.childName}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
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

import { Link } from "react-router-dom";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { useAuth } from "@/context/AuthContext";
import { Card, EmptyState } from "@/components/ui";
import { computeHeadlineMetrics, computeHeadlineTrends, breakdownBySource, breakdownByStaff, stageFunnel } from "@/utils/metrics";
import { computeAttentionFlags } from "@/utils/attention";
import { isValidLeadPhone } from "@/utils/phone";
import { isFollowUpDueToday } from "@/utils/followUp";
import { buildWhatsAppLink } from "@/utils/whatsapp";
import { logContact } from "@/lib/data/leads";
import { StatusPill } from "@/components/Pills";
import type { LeadDoc } from "@/types";
import { useState } from "react";
import {
  Users,
  UserPlus,
  CalendarCheck,
  AlertTriangle,
  Clock,
  GraduationCap,
  UserCog,
  ShieldCheck,
  UserX,
  ShieldAlert,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Phone,
  MessageCircle,
  Footprints,
  Search as SearchIcon,
  Megaphone,
  Camera,
  Globe,
  UsersRound,
  CalendarDays,
  PhoneCall,
} from "lucide-react";

function sourceIcon(source: string) {
  const s = source.toLowerCase();
  if (s.includes("instagram")) return Camera;
  if (s.includes("meta") || s.includes("facebook")) return Megaphone;
  if (s.includes("google")) return SearchIcon;
  if (s.includes("walk-in")) return Footprints;
  if (s.includes("referral")) return UsersRound;
  if (s.includes("whatsapp")) return MessageCircle;
  if (s.includes("website")) return Globe;
  if (s.includes("phone")) return PhoneCall;
  return Users;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function timeOf(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

const STAT_TINTS = {
  blue: { bg: "#EFF6FF", fg: "#2563EB" },
  purple: { bg: "#F5F3FF", fg: "#7C3AED" },
  orange: { bg: "#FFF7ED", fg: "#C2410C" },
  green: { bg: "#ECFDF5", fg: "#0D9488" },
} as const;

function TrendBadge({ pct }: { pct: number }) {
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  const tone = pct > 0 ? "text-good" : pct < 0 ? "text-bad" : "text-ink-faint";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${tone}`}>
      <Icon className="w-3 h-3" />
      {pct > 0 ? "+" : ""}{pct}%
    </span>
  );
}

function StatTile({
  value,
  label,
  icon: Icon,
  tint,
  trend,
  href,
}: {
  value: number;
  label: string;
  icon: typeof Users;
  tint: keyof typeof STAT_TINTS;
  trend: number;
  href: string;
}) {
  const { bg, fg } = STAT_TINTS[tint];
  return (
    <Link to={href} className="block rounded-2xl p-5 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: bg }}>
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "white", color: fg }}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="font-display text-[28px] leading-none font-semibold mt-3" style={{ color: fg }}>{value}</div>
      <div className="text-[13px] text-ink-soft mt-2">{label}</div>
      <div className="mt-1.5"><TrendBadge pct={trend} /></div>
    </Link>
  );
}

const STAGE_COLORS = ["#60A5FA", "#3B82F6", "#8B5CF6", "#A855F7", "#EC4899", "#F97316", "#10B981"];
const STAGE_SHORT: Record<string, string> = {
  "New Lead": "New Lead",
  Contacted: "Contacted",
  Interested: "Interested",
  "Visit Scheduled": "Visit Sched.",
  "Visit Completed": "Visit Done",
  "Admission Discussion": "Discussion",
  "Admission Confirmed": "Confirmed",
};

function PipelineChevron({ funnel }: { funnel: { stage: string; count: number }[] }) {
  const total = funnel[0]?.count || 1;
  return (
    <div className="flex w-full overflow-x-auto rounded-xl">
      {funnel.map((stage, i) => {
        const pct = total ? Math.round((stage.count / total) * 100) : 0;
        const color = STAGE_COLORS[i % STAGE_COLORS.length];
        return (
          <Link
            key={stage.stage}
            to={`/leads?status=${encodeURIComponent(stage.stage)}`}
            title={stage.stage}
            className="relative flex-1 min-w-[108px] text-white px-4 py-4 flex flex-col justify-center hover:brightness-95 transition-[filter]"
            style={{
              backgroundColor: color,
              clipPath:
                i === 0
                  ? "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)"
                  : i === funnel.length - 1
                    ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)"
                    : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)",
              marginLeft: i === 0 ? 0 : "-13px",
            }}
          >
            <div className="text-[11px] font-semibold opacity-90 truncate">{STAGE_SHORT[stage.stage] ?? stage.stage}</div>
            <div className="text-xl font-bold leading-tight">{stage.count}</div>
            <div className="text-[10px] opacity-80">{pct}%</div>
          </Link>
        );
      })}
    </div>
  );
}

const DONUT_COLORS = ["#3B82F6", "#10B981", "#F97316", "#EC4899", "#8B5CF6", "#8D97A8"];

function SourceDonut({ rows }: { rows: { key: string; total: number }[] }) {
  const top = rows.slice(0, 5);
  const rest = rows.slice(5).reduce((sum, r) => sum + r.total, 0);
  const segments = rest > 0 ? [...top, { key: "Other", total: rest }] : top;
  const grandTotal = segments.reduce((s, r) => s + r.total, 0) || 1;

  const r = 60;
  const circumference = 2 * Math.PI * r;
  const dashes = segments.map((seg) => (seg.total / grandTotal) * circumference);
  const offsets = dashes.reduce<number[]>((acc, _dash, i) => [...acc, (acc[i - 1] ?? 0) + (i === 0 ? 0 : dashes[i - 1])], []);

  return (
    <div className="flex items-center gap-6 flex-wrap sm:flex-nowrap">
      <div className="relative shrink-0 w-[160px] h-[160px]">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          {segments.map((seg, i) => (
            <circle
              key={seg.key}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="20"
              strokeDasharray={`${dashes[i]} ${circumference - dashes[i]}`}
              strokeDashoffset={-offsets[i]}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-2xl font-bold text-ink">{grandTotal}</div>
          <div className="text-[11px] text-ink-faint">Leads</div>
        </div>
      </div>
      <div className="flex-1 min-w-[180px] space-y-2">
        {segments.map((seg, i) => (
          <div key={seg.key} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="text-ink truncate">{seg.key}</span>
            </span>
            <span className="text-ink-faint font-semibold shrink-0">
              {seg.total} <span className="text-ink-faint font-normal">({Math.round((seg.total / grandTotal) * 100)}%)</span>
            </span>
          </div>
        ))}
        {segments.length === 0 && <p className="text-sm text-ink-faint">No leads yet.</p>}
      </div>
    </div>
  );
}

interface AgendaItem {
  lead: LeadDoc;
  time: Date;
  kind: "Follow-up" | "Visit";
  type: string;
}

export function Dashboard() {
  const { leads, loading } = useLeads();
  const { staffName } = useLookups();
  const { user } = useAuth();
  const [sourcePeriod, setSourcePeriod] = useState<"month" | "all">("all");

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto animate-pulse">
        <div className="h-40 bg-surface-2 rounded-2xl mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-surface-2 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const now = new Date();
  const metrics = computeHeadlineMetrics(leads, now);
  const trends = computeHeadlineTrends(leads, now);
  const sourceLeads =
    sourcePeriod === "month"
      ? leads.filter((l) => {
          const c = l.createdAt?.toDate();
          return c && c.getFullYear() === now.getFullYear() && c.getMonth() === now.getMonth();
        })
      : leads;
  const bySource = breakdownBySource(sourceLeads).filter((r) => r.key !== "—");
  const byStaff = breakdownByStaff(leads);
  const attentionFlags = computeAttentionFlags(leads);
  const funnel = stageFunnel(leads);

  const flagsByLead = new Map<string, typeof attentionFlags>();
  for (const flag of attentionFlags) {
    if (!flagsByLead.has(flag.lead.id)) flagsByLead.set(flag.lead.id, []);
    flagsByLead.get(flag.lead.id)!.push(flag);
  }
  const attentionLeadCount = flagsByLead.size;

  const unassignedCount = leads.filter((l) => l.assignedStaffId == null && l.status !== "Admission Confirmed").length;
  const invalidNumberCount = leads.filter((l) => !isValidLeadPhone(l.parentPhone)).length;

  interface AttentionItem {
    key: string;
    label: string;
    count: number;
    href: string;
    icon: typeof AlertTriangle;
    urgent: boolean;
  }
  const attentionItems: AttentionItem[] = [
    { key: "overdue", label: "Overdue follow-ups", count: metrics.overdueFollowUps, href: "/leads?view=Overdue", icon: AlertTriangle, urgent: true },
    { key: "today", label: "Follow-up due today", count: metrics.todayFollowUps, href: "/leads?view=Follow-up%20Today", icon: Clock, urgent: true },
    { key: "unassigned", label: "Without assigned staff", count: unassignedCount, href: "/leads?staffId=__unassigned__", icon: UserX, urgent: false },
    { key: "invalid", label: "Invalid mobile numbers", count: invalidNumberCount, href: "/leads?special=invalid-numbers", icon: ShieldAlert, urgent: false },
    { key: "stale", label: "Untouched / going quiet", count: attentionLeadCount, href: "/leads?view=attention", icon: ShieldCheck, urgent: true },
    { key: "visits", label: "Upcoming visits", count: metrics.visitsScheduled, href: "/leads?view=Visits", icon: CalendarCheck, urgent: false },
  ];

  // Today's agenda — follow-ups due today + visits dated today, merged and
  // time-sorted. Feeds both the action-oriented list and the timeline below,
  // so there's exactly one place that defines "today's agenda".
  const agenda: AgendaItem[] = [];
  for (const lead of leads) {
    if (isFollowUpDueToday(lead, now) && lead.nextFollowUpAt) {
      agenda.push({ lead, time: lead.nextFollowUpAt.toDate(), kind: "Follow-up", type: lead.nextFollowUpType ?? "Call" });
    }
    if (lead.visitDate) {
      const v = lead.visitDate.toDate();
      if (v.getFullYear() === now.getFullYear() && v.getMonth() === now.getMonth() && v.getDate() === now.getDate()) {
        agenda.push({ lead, time: v, kind: "Visit", type: "Visit" });
      }
    }
  }
  agenda.sort((a, b) => a.time.getTime() - b.time.getTime());
  const agendaTop = agenda.slice(0, 5);

  const recentLeads = [...leads]
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .slice(0, 6);

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatTile value={metrics.totalLeadsThisMonth} label="Total Leads" icon={Users} tint="blue" trend={trends.totalLeadsTrend} href="/leads" />
        <StatTile value={metrics.newLeadsToday} label="New Leads (Today)" icon={UserPlus} tint="purple" trend={trends.newLeadsTodayTrend} href="/leads?view=All" />
        <StatTile value={metrics.visitsToday} label="Visits Today" icon={CalendarCheck} tint="orange" trend={trends.visitsTodayTrend} href="/leads?view=Visits" />
        <StatTile value={metrics.admissionsConfirmedThisMonth} label="Admissions (This month)" icon={GraduationCap} tint="green" trend={trends.admissionsTrend} href="/leads?view=Converted" />
      </div>

      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-ink">Admissions Pipeline</h2>
            <p className="text-xs text-ink-faint mt-1">How far leads have progressed, stage by stage.</p>
          </div>
        </div>
        <PipelineChevron funnel={funnel} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-0 overflow-hidden">
          <div className="p-5 pb-3">
            <h2 className="font-semibold text-ink">Today's Follow-ups {agendaTop.length > 0 && `(${agendaTop.length})`}</h2>
            <p className="text-xs text-ink-faint mt-1">Who to call or message, in order.</p>
          </div>
          {agendaTop.length === 0 ? (
            <EmptyState icon={<CalendarCheck />} title="Nothing scheduled for today" description="Follow-ups and visits dated today will show up here." />
          ) : (
            <div className="divide-y divide-border-soft">
              {agendaTop.map((item) => {
                const SourceIcon = sourceIcon(item.lead.sourceChannel);
                const waLink = buildWhatsAppLink(item.lead.parentPhone, item.lead.parentName, item.lead.sourceChannel);
                const canCall = isValidLeadPhone(item.lead.parentPhone);
                return (
                  <div key={`${item.lead.id}-${item.kind}`} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-9 h-9 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center text-[12px] font-bold shrink-0">
                      {initials(item.lead.parentName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/leads/${item.lead.id}`} className="font-semibold text-sm text-ink hover:text-accent truncate block">{item.lead.parentName}</Link>
                      <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                        <SourceIcon className="w-3 h-3" /> {item.lead.childName} · {item.kind}
                      </div>
                    </div>
                    <div className="text-xs text-ink-faint shrink-0 hidden sm:block">{timeOf(item.time)}</div>
                    {canCall ? (
                      <a href={`tel:${item.lead.parentPhone}`} onClick={() => user && logContact(item.lead, "call_logged", user.uid)} className="shrink-0 w-8 h-8 rounded-lg border border-border flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-accent" aria-label="Call">
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    ) : waLink ? (
                      <a href={waLink} target="_blank" rel="noreferrer" onClick={() => user && logContact(item.lead, "whatsapp_logged", user.uid)} className="shrink-0 w-8 h-8 rounded-lg border border-good/30 bg-good-soft flex items-center justify-center text-good hover:brightness-95" aria-label="WhatsApp">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="p-5 pb-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0"><CalendarDays className="w-4 h-4" /></div>
            <div><h2 className="font-semibold text-ink">Calendar — Today</h2><p className="text-xs text-ink-faint mt-0.5">A quick look at today's schedule</p></div>
          </div>
          {agendaTop.length === 0 ? (
            <EmptyState icon={<CalendarDays />} title="Nothing on today's calendar" />
          ) : (
            <div className="px-5 pb-5">
              <div className="relative pl-5 space-y-5">
                <div className="absolute left-[3px] top-1 bottom-1 w-px bg-border" />
                {agendaTop.map((item) => (
                  <Link key={`${item.lead.id}-${item.kind}-tl`} to={`/leads/${item.lead.id}`} className="relative block group">
                    <span className={`absolute -left-5 top-1 w-[7px] h-[7px] rounded-full ${item.kind === "Visit" ? "bg-warn" : "bg-accent"}`} />
                    <div className="text-xs font-semibold text-ink-faint">{timeOf(item.time)}</div>
                    <div className="text-sm font-medium text-ink group-hover:text-accent transition-colors">{item.lead.parentName}</div>
                    <div className="text-xs text-ink-faint">{item.kind === "Visit" ? "School Visit" : item.type}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="p-5 pb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0"><UsersRound className="w-4 h-4" /></div>
              <div><h2 className="font-semibold text-ink">Lead Sources</h2><p className="text-xs text-ink-faint mt-0.5">Where enquiries come from</p></div>
            </div>
            <select
              value={sourcePeriod}
              onChange={(e) => setSourcePeriod(e.target.value as "month" | "all")}
              className="text-xs font-semibold text-ink-soft bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="all">All Time</option>
              <option value="month">This Month</option>
            </select>
          </div>
          <div className="px-5 pb-5"><SourceDonut rows={bySource} /></div>
        </Card>

        <Card className="p-0 overflow-hidden flex flex-col">
          <div className="p-5 pb-3">
            <h2 className="font-semibold text-ink">Needs attention</h2>
            <p className="text-xs text-ink-faint mt-1">Who needs you today.</p>
          </div>
          {attentionItems.every((i) => i.count === 0) ? (
            <div className="px-5 pb-5 flex-1 flex items-center">
              <div className="w-full rounded-xl border border-good/20 bg-good-soft px-4 py-5 text-center">
                <ShieldCheck className="w-5 h-5 text-good mx-auto mb-2" />
                <div className="font-semibold text-good text-sm">All clear</div>
                <p className="text-xs text-good/80 mt-1">Nothing needs attention right now.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border-soft">
              {attentionItems.map((item) => {
                const active = item.count > 0;
                return (
                  <Link
                    key={item.key}
                    to={item.href}
                    className={`group flex items-center justify-between gap-3 px-5 py-3 transition-colors ${active ? "hover:bg-surface-2" : "opacity-60 hover:opacity-100 hover:bg-surface-2"}`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <item.icon className={`w-4 h-4 shrink-0 ${active && item.urgent ? "text-bad" : active ? "text-warn" : "text-ink-faint"}`} />
                      <span className="text-sm text-ink truncate">{item.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-sm font-bold ${active && item.urgent ? "text-bad" : active ? "text-ink" : "text-ink-faint"}`}>{item.count}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-ink-faint group-hover:text-accent transition-colors" />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden p-0 mb-6">
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

      <Card className="p-0 overflow-hidden">
        <div className="p-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div><h2 className="font-semibold text-ink">Recent Leads</h2><p className="text-xs text-ink-faint mt-1">Latest enquiries, newest first.</p></div>
          <Link to="/leads" className="text-xs font-semibold text-accent hover:text-accent-strong shrink-0">View All →</Link>
        </div>
        {recentLeads.length === 0 ? (
          <EmptyState icon={<Users />} title="No leads yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide">
                  <th className="pb-2 pl-5">Name</th>
                  <th className="pb-2">Source</th>
                  <th className="pb-2">Stage</th>
                  <th className="pb-2">Assigned To</th>
                  <th className="pb-2 pr-5">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-t border-border-soft hover:bg-surface-2 transition-colors">
                    <td className="py-2.5 pl-5">
                      <Link to={`/leads/${lead.id}`} className="font-medium text-ink hover:text-accent">{lead.parentName}</Link>
                      <div className="text-xs text-ink-faint">{lead.childName}</div>
                    </td>
                    <td className="py-2.5 text-ink-soft">{lead.sourceChannel}</td>
                    <td className="py-2.5"><StatusPill status={lead.status} /></td>
                    <td className="py-2.5 text-ink-soft">{staffName(lead.assignedStaffId)}</td>
                    <td className="py-2.5 pr-5 text-ink-faint">{lead.createdAt?.toDate().toLocaleDateString("en-GB", { day: "numeric", month: "short" }) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

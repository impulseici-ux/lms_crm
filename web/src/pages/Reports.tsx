import { useMemo, useState } from "react";
import type { LeadDoc } from "@/types";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { FilterBar, EMPTY_FILTERS, applyFilters } from "@/components/FilterBar";
import { Button, Card, SectionHeading, ProgressBar, EmptyState } from "@/components/ui";
import { downloadCsv } from "@/utils/csv";
import { breakdownBySource, breakdownByCampaign, breakdownByStaff, stageFunnel, lostLeadBreakdown, type GroupBreakdown } from "@/utils/metrics";
import { deriveFollowUpState } from "@/utils/followUp";
import { StatusPill } from "@/components/Pills";
import { Download, ClipboardList, Radio, Megaphone, UserCog, CalendarClock, CalendarCheck, TrendingUp, UserX, FileBarChart, Search } from "lucide-react";
import type { ComponentType } from "react";

const REPORTS = [
  { key: "Lead report", icon: ClipboardList },
  { key: "Source-wise report", icon: Radio },
  { key: "Campaign report", icon: Megaphone },
  { key: "Staff performance", icon: UserCog },
  { key: "Follow-up report", icon: CalendarClock },
  { key: "Visit report", icon: CalendarCheck },
  { key: "Admission conversion report", icon: TrendingUp },
  { key: "Lost lead report", icon: UserX },
] as const;
type ReportName = (typeof REPORTS)[number]["key"];

export function Reports() {
  const { leads, loading } = useLeads();
  const { programName, staffName, campaignName } = useLookups();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState<ReportName>("Lead report");
  const rows = useMemo(() => applyFilters(leads, filters), [leads, filters]);

  if (loading) return <div className="text-ink-soft">Loading reports…</div>;

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <SectionHeading eyebrow="Analytics" title="Reports" description="Filter the pipeline and export operational reports." />

      <FilterBar filters={filters} onApply={setFilters} />

      <div className="flex flex-wrap gap-2 mb-5">
        {REPORTS.map((r) => {
          const active = report === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setReport(r.key)}
              className={`inline-flex items-center gap-2 text-[13px] font-semibold px-3.5 py-2 rounded-xl border transition-colors ${
                active ? "bg-accent-soft text-accent-strong border-accent/30" : "bg-surface text-ink-soft border-border hover:border-ink-faint/40 hover:text-ink"
              }`}
            >
              <r.icon className="w-4 h-4" />
              {r.key}
            </button>
          );
        })}
      </div>

      {report === "Lead report" && <LeadReport rows={rows} programName={programName} staffName={staffName} />}
      {report === "Source-wise report" && <BreakdownReport title="Source" data={breakdownBySource(rows)} labelFor={(k) => k} />}
      {report === "Campaign report" && <CampaignReport rows={rows} campaignName={campaignName} />}
      {report === "Staff performance" && <BreakdownReport title="Staff" data={breakdownByStaff(rows)} labelFor={(k) => staffName(k === "—" ? null : k)} />}
      {report === "Follow-up report" && <FollowUpReport rows={rows} />}
      {report === "Visit report" && <VisitReport rows={rows} />}
      {report === "Admission conversion report" && <ConversionReport rows={rows} />}
      {report === "Lost lead report" && <BreakdownReport title="Closed reason" data={lostLeadBreakdown(rows)} labelFor={(k) => k} />}
    </div>
  );
}

function ReportCard({ icon: Icon, title, subtitle, action, children }: { icon: ComponentType<{ className?: string }>; title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden" padded={false}>
      <div className="p-5 pb-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></div>
          <div><h2 className="font-semibold text-ink">{title}</h2><p className="text-xs text-ink-faint mt-0.5">{subtitle}</p></div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function LeadReport({ rows, programName, staffName }: { rows: LeadDoc[]; programName: (id: string | null) => string; staffName: (id: string | null) => string }) {
  const [q, setQ] = useState("");
  const exportCsv = () =>
    downloadCsv("lead-report.csv", rows.map((l) => ({
      parent: l.parentName, phone: l.parentPhone, child: l.childName,
      program: programName(l.interestedProgramId), source: l.sourceChannel,
      status: l.status, priority: l.priority, staff: staffName(l.assignedStaffId),
      createdAt: l.createdAt?.toDate().toISOString() ?? "",
    })));
  const query = q.trim().toLowerCase();
  const shown = query
    ? rows.filter((l) => `${l.parentName} ${l.childName} ${programName(l.interestedProgramId)} ${staffName(l.assignedStaffId)}`.toLowerCase().includes(query))
    : rows;
  return (
    <ReportCard
      icon={ClipboardList}
      title="Every lead and its current state"
      subtitle={`${shown.length} of ${rows.length} leads in this filtered view`}
      action={<Button variant="secondary" size="sm" onClick={exportCsv}><Download className="w-3.5 h-3.5" /> Export CSV</Button>}
    >
      <div className="px-5 pb-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search this table…"
            className="w-full rounded-lg border border-border bg-surface pl-8 pr-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead><tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide"><th className="pb-2 pl-5">Parent</th><th className="pb-2">Child</th><th className="pb-2">Program</th><th className="pb-2">Status</th><th className="pb-2 pr-5">Staff</th></tr></thead>
          <tbody>{shown.map((l) => <tr key={l.id} className="border-t border-border-soft"><td className="py-2.5 pl-5 font-medium">{l.parentName}</td><td className="py-2.5">{l.childName}</td><td className="py-2.5">{programName(l.interestedProgramId)}</td><td className="py-2.5"><StatusPill status={l.status} /></td><td className="py-2.5 pr-5">{staffName(l.assignedStaffId)}</td></tr>)}</tbody>
        </table>
      </div>
      {shown.length === 0 && <EmptyState icon={<FileBarChart />} title="No leads match these filters" />}
    </ReportCard>
  );
}

function BreakdownReport({ title, data, labelFor }: { title: string; data: GroupBreakdown[]; labelFor: (key: string) => string }) {
  const exportCsv = () => downloadCsv(`${title.toLowerCase()}-report.csv`, data.map((d) => ({ [title]: labelFor(d.key), ...d })));
  const icon = title === "Staff" ? UserCog : title === "Campaign" ? Megaphone : title === "Closed reason" ? UserX : Radio;
  return (
    <ReportCard
      icon={icon}
      title={`${title} breakdown`}
      subtitle={`${data.length} ${title.toLowerCase()}${data.length === 1 ? "" : "s"} in this view`}
      action={<Button variant="secondary" size="sm" onClick={exportCsv}><Download className="w-3.5 h-3.5" /> Export CSV</Button>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide">
              <th className="pb-2 pl-5">{title}</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Contacted</th>
              <th className="pb-2 text-right">Visits</th><th className="pb-2 text-right">Admissions</th><th className="pb-2 text-right">Overdue</th><th className="pb-2 pr-5">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-t border-border-soft">
                <td className="py-2.5 pl-5 font-medium">{labelFor(d.key)}</td>
                <td className="py-2.5 text-right">{d.total}</td>
                <td className="py-2.5 text-right">{d.contacted}</td>
                <td className="py-2.5 text-right">{d.visits}</td>
                <td className="py-2.5 text-right">{d.admissions}</td>
                <td className="py-2.5 text-right">{d.overdue > 0 ? <span className="text-bad font-semibold">{d.overdue}</span> : d.overdue}</td>
                <td className="py-2.5 pr-5">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs font-semibold w-9 text-right">{(d.conversionRate * 100).toFixed(0)}%</span>
                    <ProgressBar value={d.conversionRate * 100} tone="good" className="w-16" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length === 0 && <EmptyState icon={<FileBarChart />} title="No data for this filter" />}
    </ReportCard>
  );
}

function CampaignReport({ rows, campaignName }: { rows: LeadDoc[]; campaignName: (id: string | null) => string }) {
  return <BreakdownReport title="Campaign" data={breakdownByCampaign(rows.filter((l) => l.campaignId))} labelFor={(k) => campaignName(k === "—" ? null : k)} />;
}

function FollowUpReport({ rows }: { rows: LeadDoc[] }) {
  const states = { Overdue: 0, "Due Today": 0, Upcoming: 0, "None Set": 0 };
  for (const l of rows) states[deriveFollowUpState(l.nextFollowUpAt)]++;
  const dueOrPast = rows.filter((l) => l.nextFollowUpAt && l.nextFollowUpAt.toDate() <= new Date());
  const completed = dueOrPast.filter((l) => l.lastContactedAt && (!l.nextFollowUpAt || l.lastContactedAt.toDate() >= l.createdAt!.toDate()));
  const completionRate = dueOrPast.length ? (completed.length / dueOrPast.length) * 100 : 0;
  const toneFor: Record<string, "bad" | "warn" | "accent" | "neutral"> = { Overdue: "bad", "Due Today": "warn", Upcoming: "accent", "None Set": "neutral" };
  return (
    <ReportCard icon={CalendarClock} title="Follow-up completion" subtitle={`${rows.length} leads in this view`}>
      <div className="px-5 pb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {Object.entries(states).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 p-4 text-center">
              <div className={`font-display text-2xl font-semibold ${toneFor[k] === "bad" ? "text-bad" : toneFor[k] === "warn" ? "text-warn" : ""}`}>{v}</div>
              <div className="text-xs text-ink-faint mt-1">{k}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ProgressBar value={completionRate} tone="good" className="flex-1" />
          <span className="text-sm font-semibold text-ink shrink-0">{completionRate.toFixed(0)}% completion</span>
        </div>
        <p className="text-xs text-ink-faint mt-2">Estimated completion rate on due/overdue follow-ups.</p>
      </div>
    </ReportCard>
  );
}

function VisitReport({ rows }: { rows: LeadDoc[] }) {
  const scheduled = rows.filter((l) => l.status === "Visit Scheduled").length;
  const completed = rows.filter((l) => ["Visit Completed", "Admission Discussion", "Admission Confirmed"].includes(l.status)).length;
  const overdueScheduled = rows.filter((l) => l.status === "Visit Scheduled" && l.visitDate && l.visitDate.toDate() < new Date()).length;
  return (
    <ReportCard icon={CalendarCheck} title="Visits" subtitle={`${rows.length} leads in this view`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5 pt-0">
        <Metric label="Scheduled (upcoming)" value={scheduled} />
        <Metric label="Completed" value={completed} />
        <Metric label="Past visit date" value={overdueScheduled} bad />
      </div>
    </ReportCard>
  );
}

function ConversionReport({ rows }: { rows: LeadDoc[] }) {
  const funnel = stageFunnel(rows);
  const max = funnel[0]?.count || 1;
  return (
    <ReportCard icon={TrendingUp} title="Stage-to-stage conversion" subtitle={`${rows.length} leads in this view`}>
      <div className="p-5 pt-0 space-y-4">
        {funnel.map((f, i) => {
          const pct = max ? (f.count / max) * 100 : 0;
          const prevPct = i > 0 && funnel[i - 1].count ? (f.count / funnel[i - 1].count) * 100 : null;
          return (
            <div key={f.stage}>
              <div className="flex justify-between gap-3 text-sm mb-1.5">
                <span className="font-medium text-ink">{i + 1}. {f.stage}</span>
                <span className="text-ink-faint shrink-0 font-semibold">{f.count}{prevPct != null && <span className="text-ink-faint font-normal"> · {prevPct.toFixed(0)}% of prev.</span>}</span>
              </div>
              <ProgressBar value={pct} tone={f.stage === "Admission Confirmed" ? "good" : "accent"} />
            </div>
          );
        })}
      </div>
    </ReportCard>
  );
}

function Metric({ label, value, bad = false }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-4">
      <div className={`font-display text-2xl font-semibold ${bad ? "text-bad" : ""}`}>{value}</div>
      <div className="text-xs text-ink-faint mt-1">{label}</div>
    </div>
  );
}

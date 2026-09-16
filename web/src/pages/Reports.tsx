import { useMemo, useState } from "react";
import type { LeadDoc } from "@/types";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { FilterBar, EMPTY_FILTERS, applyFilters } from "@/components/FilterBar";
import { Button, Card, Select } from "@/components/ui";
import { downloadCsv } from "@/utils/csv";
import { breakdownBySource, breakdownByCampaign, breakdownByStaff, stageFunnel, lostLeadBreakdown, type GroupBreakdown } from "@/utils/metrics";
import { deriveFollowUpState } from "@/utils/followUp";
import { StatusPill } from "@/components/Pills";

const REPORTS = ["Lead report", "Source-wise report", "Campaign report", "Staff performance", "Follow-up report", "Visit report", "Admission conversion report", "Lost lead report"] as const;
type ReportName = (typeof REPORTS)[number];

export function Reports() {
  const { leads, loading } = useLeads();
  const { programName, staffName, campaignName } = useLookups();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState<ReportName>("Lead report");
  const rows = useMemo(() => applyFilters(leads, filters), [leads, filters]);

  if (loading) return <div className="text-ink-soft">Loading reports…</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-ink-soft mt-1">Filter the pipeline and export operational reports.</p>
        </div>
        <Select value={report} onChange={(e) => setReport(e.target.value as ReportName)} className="w-full sm:w-72">
          {REPORTS.map((r) => <option key={r}>{r}</option>)}
        </Select>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

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

function LeadReport({ rows, programName, staffName }: { rows: LeadDoc[]; programName: (id: string | null) => string; staffName: (id: string | null) => string }) {
  const exportCsv = () => downloadCsv("lead-report.csv", rows.map((l) => ({ parent: l.parentName, phone: l.parentPhone, child: l.childName, program: programName(l.interestedProgramId), source: l.sourceChannel, status: l.status, priority: l.priority, staff: staffName(l.assignedStaffId), createdAt: l.createdAt?.toDate().toISOString() ?? "" })));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
        <div><h2 className="font-semibold">Every lead and its current state</h2><p className="text-xs text-ink-faint mt-0.5">{rows.length} leads in this filtered view.</p></div>
        <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[620px]">
        <thead><tr className="text-left text-ink-faint text-xs uppercase"><th className="pb-2">Parent</th><th>Child</th><th>Program</th><th>Status</th><th>Staff</th></tr></thead>
        <tbody>{rows.map((l) => <tr key={l.id} className="border-t border-border-soft"><td className="py-2">{l.parentName}</td><td>{l.childName}</td><td>{programName(l.interestedProgramId)}</td><td><StatusPill status={l.status} /></td><td>{staffName(l.assignedStaffId)}</td></tr>)}</tbody>
      </table></div>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-ink-faint">No leads match these filters.</p>}
    </Card>
  );
}

function BreakdownReport({ title, data, labelFor }: { title: string; data: GroupBreakdown[]; labelFor: (key: string) => string }) {
  const exportCsv = () => downloadCsv(`${title.toLowerCase()}-report.csv`, data.map((d) => ({ [title]: labelFor(d.key), ...d })));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3"><h2 className="font-semibold">{title} breakdown</h2><Button variant="secondary" onClick={exportCsv}>Export CSV</Button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[760px]"><thead><tr className="text-left text-ink-faint text-xs uppercase"><th className="pb-2">{title}</th><th className="text-right">Leads</th><th className="text-right">Contacted</th><th className="text-right">Visits</th><th className="text-right">Admissions</th><th className="text-right">Overdue</th><th className="text-right">Conversion</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.key} className="border-t border-border-soft"><td className="py-2 font-medium">{labelFor(d.key)}</td><td className="text-right">{d.total}</td><td className="text-right">{d.contacted}</td><td className="text-right">{d.visits}</td><td className="text-right">{d.admissions}</td><td className="text-right text-bad">{d.overdue}</td><td className="text-right">{(d.conversionRate * 100).toFixed(0)}%</td></tr>)}</tbody>
      </table></div>
      {data.length === 0 && <p className="py-8 text-center text-sm text-ink-faint">No data for this filter.</p>}
    </Card>
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
  return <Card><h2 className="font-semibold mb-4">Follow-up completion</h2><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">{Object.entries(states).map(([k, v]) => <div key={k} className="rounded-lg bg-surface-2 p-3 text-center"><div className="font-display text-2xl font-semibold">{v}</div><div className="text-xs text-ink-faint">{k}</div></div>)}</div><div className="text-sm text-ink-soft">Estimated completion rate on due/overdue follow-ups: <span className="font-semibold text-ink">{completionRate.toFixed(0)}%</span></div></Card>;
}

function VisitReport({ rows }: { rows: LeadDoc[] }) {
  const scheduled = rows.filter((l) => l.status === "Visit Scheduled").length;
  const completed = rows.filter((l) => ["Visit Completed", "Admission Discussion", "Admission Confirmed"].includes(l.status)).length;
  const overdueScheduled = rows.filter((l) => l.status === "Visit Scheduled" && l.visitDate && l.visitDate.toDate() < new Date()).length;
  return <Card><h2 className="font-semibold mb-4">Visits</h2><div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center"><Metric label="Scheduled (upcoming)" value={scheduled} /><Metric label="Completed" value={completed} /><Metric label="Past visit date" value={overdueScheduled} bad /></div></Card>;
}

function ConversionReport({ rows }: { rows: LeadDoc[] }) {
  const funnel = stageFunnel(rows);
  const max = funnel[0]?.count || 1;
  return <Card><h2 className="font-semibold mb-4">Stage-to-stage conversion</h2><div className="space-y-3">{funnel.map((f, i) => { const pct = max ? (f.count / max) * 100 : 0; const prevPct = i > 0 && funnel[i - 1].count ? (f.count / funnel[i - 1].count) * 100 : null; return <div key={f.stage}><div className="flex justify-between gap-3 text-sm mb-1"><span>{f.stage}</span><span className="text-ink-faint shrink-0">{f.count}{prevPct != null && ` · ${prevPct.toFixed(0)}% of prev.`}</span></div><div className="h-3 bg-surface-2 rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} /></div></div>; })}</div></Card>;
}

function Metric({ label, value, bad = false }: { label: string; value: number; bad?: boolean }) {
  return <div className="rounded-lg bg-surface-2 p-4"><div className={`font-display text-2xl font-semibold ${bad ? "text-bad" : ""}`}>{value}</div><div className="text-xs text-ink-faint mt-1">{label}</div></div>;
}

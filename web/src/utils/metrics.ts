import type { LeadDoc } from "@/types";
import { isClosedStatus } from "@/types";
import { isFollowUpDueToday, isFollowUpOverdue } from "@/utils/followUp";

function isSameMonth(d: Date, now: Date) {
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
function isSameDay(d: Date, now: Date) {
  return isSameMonth(d, now) && d.getDate() === now.getDate();
}

export interface HeadlineMetrics {
  totalLeadsThisMonth: number;
  newLeadsToday: number;
  visitsScheduled: number;
  visitsToday: number;
  overdueFollowUps: number;
  todayFollowUps: number;
  admissionsConfirmedThisMonth: number;
}

export function computeHeadlineMetrics(leads: LeadDoc[], now: Date = new Date()): HeadlineMetrics {
  let totalLeadsThisMonth = 0;
  let newLeadsToday = 0;
  let visitsScheduled = 0;
  let visitsToday = 0;
  let overdueFollowUps = 0;
  let todayFollowUps = 0;
  let admissionsConfirmedThisMonth = 0;

  for (const lead of leads) {
    const created = lead.createdAt?.toDate();
    if (created && isSameMonth(created, now)) totalLeadsThisMonth++;
    if (created && isSameDay(created, now)) newLeadsToday++;
    if (lead.status === "Visit Scheduled") visitsScheduled++;
    if (lead.visitDate && isSameDay(lead.visitDate.toDate(), now)) visitsToday++;
    if (isFollowUpOverdue(lead, now)) overdueFollowUps++;
    if (isFollowUpDueToday(lead, now)) todayFollowUps++;
    if (
      lead.status === "Admission Confirmed" &&
      lead.admissionConfirmedAt &&
      isSameMonth(lead.admissionConfirmedAt.toDate(), now)
    ) {
      admissionsConfirmedThisMonth++;
    }
  }

  return { totalLeadsThisMonth, newLeadsToday, visitsScheduled, visitsToday, overdueFollowUps, todayFollowUps, admissionsConfirmedThisMonth };
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

export interface HeadlineTrends {
  totalLeadsTrend: number; // this month vs last month
  newLeadsTodayTrend: number; // today vs yesterday
  visitsTodayTrend: number; // today vs yesterday
  admissionsTrend: number; // this month vs last month
}

/** Period-over-period % change for the Dashboard's top stat cards. Every
 * comparison re-derives both periods from the same `leads` array (no stored
 * "previous period" snapshot) so it's always consistent with what's on screen. */
export function computeHeadlineTrends(leads: LeadDoc[], now: Date = new Date()): HeadlineTrends {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let thisMonthLeads = 0;
  let lastMonthLeads = 0;
  let todayNew = 0;
  let yesterdayNew = 0;
  let visitsToday = 0;
  let visitsYesterday = 0;
  let admissionsThisMonth = 0;
  let admissionsLastMonth = 0;

  for (const lead of leads) {
    const created = lead.createdAt?.toDate();
    if (created) {
      if (isSameMonth(created, now)) thisMonthLeads++;
      if (isSameMonth(created, lastMonthRef)) lastMonthLeads++;
      if (isSameDay(created, now)) todayNew++;
      if (isSameDay(created, yesterday)) yesterdayNew++;
    }
    if (lead.visitDate) {
      const visit = lead.visitDate.toDate();
      if (isSameDay(visit, now)) visitsToday++;
      if (isSameDay(visit, yesterday)) visitsYesterday++;
    }
    if (lead.status === "Admission Confirmed" && lead.admissionConfirmedAt) {
      const confirmed = lead.admissionConfirmedAt.toDate();
      if (isSameMonth(confirmed, now)) admissionsThisMonth++;
      if (isSameMonth(confirmed, lastMonthRef)) admissionsLastMonth++;
    }
  }

  return {
    totalLeadsTrend: percentChange(thisMonthLeads, lastMonthLeads),
    newLeadsTodayTrend: percentChange(todayNew, yesterdayNew),
    visitsTodayTrend: percentChange(visitsToday, visitsYesterday),
    admissionsTrend: percentChange(admissionsThisMonth, admissionsLastMonth),
  };
}

export interface GroupBreakdown {
  key: string;
  total: number;
  contacted: number;
  visits: number;
  admissions: number;
  overdue: number;
  conversionRate: number; // admissions / total
  contactRate: number; // contacted / total
}

function groupBy(leads: LeadDoc[], keyFn: (l: LeadDoc) => string | null): GroupBreakdown[] {
  const map = new Map<string, LeadDoc[]>();
  for (const lead of leads) {
    const key = keyFn(lead) ?? "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(lead);
  }
  return Array.from(map.entries())
    .map(([key, group]) => {
      const total = group.length;
      const contacted = group.filter((l) => l.lastContactedAt != null).length;
      const visits = group.filter((l) =>
        ["Visit Scheduled", "Visit Completed", "Admission Discussion", "Admission Confirmed"].includes(l.status)
      ).length;
      const admissions = group.filter((l) => l.status === "Admission Confirmed").length;
      const overdue = group.filter((l) => isFollowUpOverdue(l)).length;
      return {
        key,
        total,
        contacted,
        visits,
        admissions,
        overdue,
        conversionRate: total ? admissions / total : 0,
        contactRate: total ? contacted / total : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export const breakdownBySource = (leads: LeadDoc[]) => groupBy(leads, (l) => l.sourceChannel);
export const breakdownByCampaign = (leads: LeadDoc[]) => groupBy(leads, (l) => l.campaignId);
export const breakdownByStaff = (leads: LeadDoc[]) => groupBy(leads, (l) => l.assignedStaffId);

export interface StageCounts {
  stage: string;
  count: number;
}

const STAGE_ORDER = [
  "New Lead",
  "Contacted",
  "Interested",
  "Visit Scheduled",
  "Visit Completed",
  "Admission Discussion",
  "Admission Confirmed",
];

export function stageFunnel(leads: LeadDoc[]): StageCounts[] {
  // Cumulative funnel: how many leads have reached at least this stage.
  const reached = (stageIndex: number) =>
    leads.filter((l) => {
      const idx = STAGE_ORDER.indexOf(l.status);
      return idx >= stageIndex || l.status === "Admission Confirmed";
    }).length;

  return STAGE_ORDER.map((stage, i) => ({ stage, count: reached(i) }));
}

export function lostLeadBreakdown(leads: LeadDoc[]): GroupBreakdown[] {
  const closed = leads.filter((l) => isClosedStatus(l.status));
  return groupBy(closed, (l) => l.status);
}

import type { LeadDoc } from "@/types";
import { deriveFollowUpState } from "@/utils/followUp";

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
  overdueFollowUps: number;
  todayFollowUps: number;
  admissionsConfirmedThisMonth: number;
}

export function computeHeadlineMetrics(leads: LeadDoc[], now: Date = new Date()): HeadlineMetrics {
  let totalLeadsThisMonth = 0;
  let newLeadsToday = 0;
  let visitsScheduled = 0;
  let overdueFollowUps = 0;
  let todayFollowUps = 0;
  let admissionsConfirmedThisMonth = 0;

  for (const lead of leads) {
    const created = lead.createdAt?.toDate();
    if (created && isSameMonth(created, now)) totalLeadsThisMonth++;
    if (created && isSameDay(created, now)) newLeadsToday++;
    if (lead.status === "Visit Scheduled") visitsScheduled++;
    const fu = deriveFollowUpState(lead.nextFollowUpAt, now);
    if (fu === "Overdue") overdueFollowUps++;
    if (fu === "Due Today") todayFollowUps++;
    if (
      lead.status === "Admission Confirmed" &&
      lead.admissionConfirmedAt &&
      isSameMonth(lead.admissionConfirmedAt.toDate(), now)
    ) {
      admissionsConfirmedThisMonth++;
    }
  }

  return { totalLeadsThisMonth, newLeadsToday, visitsScheduled, overdueFollowUps, todayFollowUps, admissionsConfirmedThisMonth };
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
      const overdue = group.filter((l) => deriveFollowUpState(l.nextFollowUpAt) === "Overdue").length;
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
  const closed = leads.filter((l) =>
    ["Not Interested", "Not Reachable", "Wrong/Invalid Number", "Future Requirement", "Lost to Competitor", "Duplicate"].includes(
      l.status
    )
  );
  return groupBy(closed, (l) => l.status);
}

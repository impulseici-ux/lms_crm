import type { LeadDoc } from "@/types";
import { isOpenStatus } from "@/types";
import { daysSince, hoursSince } from "@/utils/followUp";

export type AttentionRuleKey =
  | "not_yet_contacted"
  | "overdue_follow_up"
  | "no_follow_up_set"
  | "interested_stale"
  | "visited_stalled"
  | "assigned_untouched"
  | "generally_inactive";

export interface AttentionThresholds {
  notContactedHours: number;
  interestedStaleDays: number;
  visitedStalledDays: number;
  assignedUntouchedHours: number;
  inactiveDays: number;
}

/** Section 8 — default thresholds; admin-configurable in a real deployment. */
export const DEFAULT_ATTENTION_THRESHOLDS: AttentionThresholds = {
  notContactedHours: 24,
  interestedStaleDays: 5,
  visitedStalledDays: 3,
  assignedUntouchedHours: 48,
  inactiveDays: 14,
};

export interface AttentionFlag {
  rule: AttentionRuleKey;
  label: string;
  lead: LeadDoc;
}

export const ATTENTION_RULE_LABELS: Record<AttentionRuleKey, string> = {
  not_yet_contacted: "Not yet contacted",
  overdue_follow_up: "Overdue follow-up",
  no_follow_up_set: "No next follow-up set",
  interested_stale: "Interested but stale",
  visited_stalled: "Visited but stalled",
  assigned_untouched: "Assigned but untouched",
  generally_inactive: "Generally inactive",
};

/**
 * Section 8 — "which leads are quietly going wrong right now." Each open
 * lead is checked against every rule; a lead can carry more than one flag.
 */
export function computeAttentionFlags(
  leads: LeadDoc[],
  thresholds: AttentionThresholds = DEFAULT_ATTENTION_THRESHOLDS,
  now: Date = new Date()
): AttentionFlag[] {
  const flags: AttentionFlag[] = [];

  for (const lead of leads) {
    if (!isOpenStatus(lead.status)) continue;

    const hoursSinceCreated = hoursSince(lead.createdAt, now);
    const daysSinceActivity = daysSince(lead.lastActivityAt ?? lead.createdAt, now);
    const overdue =
      lead.nextFollowUpAt != null && (lead.nextFollowUpAt.toDate().getTime() < now.getTime()) &&
      !isSameDay(lead.nextFollowUpAt.toDate(), now);

    if (
      lead.lastContactedAt == null &&
      hoursSinceCreated != null &&
      hoursSinceCreated > thresholds.notContactedHours
    ) {
      flags.push({ rule: "not_yet_contacted", label: ATTENTION_RULE_LABELS.not_yet_contacted, lead });
    }

    if (overdue) {
      flags.push({ rule: "overdue_follow_up", label: ATTENTION_RULE_LABELS.overdue_follow_up, lead });
    }

    if (lead.nextFollowUpAt == null) {
      flags.push({ rule: "no_follow_up_set", label: ATTENTION_RULE_LABELS.no_follow_up_set, lead });
    }

    if (
      lead.status === "Interested" &&
      daysSinceActivity != null &&
      daysSinceActivity > thresholds.interestedStaleDays
    ) {
      flags.push({ rule: "interested_stale", label: ATTENTION_RULE_LABELS.interested_stale, lead });
    }

    if (
      lead.status === "Visit Completed" &&
      daysSinceActivity != null &&
      daysSinceActivity > thresholds.visitedStalledDays
    ) {
      flags.push({ rule: "visited_stalled", label: ATTENTION_RULE_LABELS.visited_stalled, lead });
    }

    if (
      lead.assignedStaffId &&
      lead.lastActivityAt == null &&
      hoursSinceCreated != null &&
      hoursSinceCreated > thresholds.assignedUntouchedHours
    ) {
      flags.push({ rule: "assigned_untouched", label: ATTENTION_RULE_LABELS.assigned_untouched, lead });
    }

    if (daysSinceActivity != null && daysSinceActivity > thresholds.inactiveDays) {
      flags.push({ rule: "generally_inactive", label: ATTENTION_RULE_LABELS.generally_inactive, lead });
    }
  }

  return flags;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

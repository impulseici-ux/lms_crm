import type { Timestamp } from "firebase/firestore";
import type { FollowUpState, LeadStatus } from "@/types";
import { isClosedStatus } from "@/types";

function toDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  return ts.toDate();
}

/** Section 6 — follow-up state is derived from the current time, never stored. */
export function deriveFollowUpState(
  nextFollowUpAt: Timestamp | null | undefined,
  now: Date = new Date()
): FollowUpState {
  const due = toDate(nextFollowUpAt);
  if (!due) return "None Set";
  if (due.getTime() < now.getTime()) {
    const isSameDay =
      due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate();
    return isSameDay ? "Due Today" : "Overdue";
  }
  const isSameDay =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();
  return isSameDay ? "Due Today" : "Upcoming";
}

/**
 * A Closed-status lead (Not Interested, Future Requirement, etc.) can still
 * hold a stale/past/today `nextFollowUpAt` from before it was closed — that
 * date must never put it back into an active follow-up queue. This is the
 * one place that combines status + date, so every view (quick filters,
 * Stats, Dashboard, Analytics, Reports) agrees on what counts as "due today"
 * or "overdue" for queue purposes.
 */
export function isFollowUpDueToday(
  lead: { status: LeadStatus; nextFollowUpAt: Timestamp | null | undefined },
  now: Date = new Date()
): boolean {
  return !isClosedStatus(lead.status) && deriveFollowUpState(lead.nextFollowUpAt, now) === "Due Today";
}

export function isFollowUpOverdue(
  lead: { status: LeadStatus; nextFollowUpAt: Timestamp | null | undefined },
  now: Date = new Date()
): boolean {
  return !isClosedStatus(lead.status) && deriveFollowUpState(lead.nextFollowUpAt, now) === "Overdue";
}

export const FOLLOW_UP_STATE_STYLES: Record<FollowUpState, { bg: string; fg: string; label: string }> = {
  Overdue: { bg: "bg-bad-soft", fg: "text-bad", label: "Overdue" },
  "Due Today": { bg: "bg-warn-soft", fg: "text-warn", label: "Due Today" },
  Upcoming: { bg: "bg-accent-soft", fg: "text-accent-strong", label: "Upcoming" },
  "None Set": { bg: "bg-surface-2", fg: "text-ink-soft", label: "None Set" },
};

export function daysSince(ts: Timestamp | null | undefined, now: Date = new Date()): number | null {
  const d = toDate(ts);
  if (!d) return null;
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
}

export function hoursSince(ts: Timestamp | null | undefined, now: Date = new Date()): number | null {
  const d = toDate(ts);
  if (!d) return null;
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60);
}

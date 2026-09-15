import type { LeadStatus, Priority } from "@/types";
import { isOpenStatus } from "@/types";
import { deriveFollowUpState, FOLLOW_UP_STATE_STYLES } from "@/utils/followUp";
import type { Timestamp } from "firebase/firestore";

export function StatusPill({ status }: { status: LeadStatus }) {
  const open = isOpenStatus(status);
  const isWon = status === "Admission Confirmed";
  const cls = isWon
    ? "bg-good-soft text-good"
    : open
    ? "bg-accent-soft text-accent-strong"
    : "bg-bad-soft text-bad";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: Priority }) {
  const cls =
    priority === "High"
      ? "bg-bad-soft text-bad"
      : priority === "Medium"
      ? "bg-warn-soft text-warn"
      : "bg-surface-2 text-ink-soft";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{priority}</span>;
}

export function FollowUpPill({ nextFollowUpAt }: { nextFollowUpAt: Timestamp | null }) {
  const state = deriveFollowUpState(nextFollowUpAt);
  const style = FOLLOW_UP_STATE_STYLES[state];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${style.bg} ${style.fg}`}>
      {style.label}
    </span>
  );
}

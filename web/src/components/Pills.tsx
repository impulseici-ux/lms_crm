import type { LeadStatus, Priority } from "@/types";
import { isOpenStatus } from "@/types";
import { deriveFollowUpState } from "@/utils/followUp";
import type { Timestamp } from "firebase/firestore";
import { Badge } from "@/components/ui";
import { AlertTriangle, Clock, GraduationCap } from "lucide-react";

export function StatusPill({ status }: { status: LeadStatus }) {
  const open = isOpenStatus(status);
  const isWon = status === "Admission Confirmed";
  const tone = isWon ? "good" : open ? "accent" : "bad";
  return (
    <Badge tone={tone} icon={isWon ? <GraduationCap className="w-3 h-3" /> : undefined}>
      {status}
    </Badge>
  );
}

const PRIORITY_TONE: Record<Priority, "bad" | "warn" | "neutral"> = {
  High: "bad",
  Medium: "warn",
  Low: "neutral",
};

export function PriorityPill({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>;
}

export function FollowUpPill({ nextFollowUpAt }: { nextFollowUpAt: Timestamp | null }) {
  const state = deriveFollowUpState(nextFollowUpAt);
  const tone = state === "Overdue" ? "bad" : state === "Due Today" ? "warn" : state === "Upcoming" ? "accent" : "neutral";
  const icon = state === "Overdue" ? <AlertTriangle className="w-3 h-3" /> : state === "Due Today" ? <Clock className="w-3 h-3" /> : undefined;
  return (
    <Badge tone={tone} icon={icon}>
      {state}
    </Badge>
  );
}

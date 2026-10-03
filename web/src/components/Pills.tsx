import type { LeadStatus, Priority } from "@/types";
import { isOpenStatus } from "@/types";
import { deriveFollowUpState } from "@/utils/followUp";
import type { Timestamp } from "firebase/firestore";
import { Badge } from "@/components/ui";
import { AlertTriangle, Clock, GraduationCap } from "lucide-react";
import type { WhatsAppMessageStatus } from "@/types/whatsapp";

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
  Urgent: "bad",
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

const WHATSAPP_STATUS_TONE: Record<WhatsAppMessageStatus, "accent" | "good" | "warn" | "bad" | "neutral"> = {
  DRAFT: "neutral",
  QUEUED: "neutral",
  PROCESSING: "accent",
  SIMULATED: "warn", // never "good" — a simulated message was NOT actually delivered
  PENDING_PROVIDER: "neutral",
  SENT: "good",
  DELIVERED: "good",
  READ: "good",
  FAILED: "bad",
  CANCELLED: "bad",
  MANUAL_OPENED: "accent",
};

const WHATSAPP_STATUS_LABEL: Record<WhatsAppMessageStatus, string> = {
  DRAFT: "Draft",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  SIMULATED: "Simulated",
  PENDING_PROVIDER: "Pending Integration",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  MANUAL_OPENED: "Manual / Opened",
};

export function WhatsAppStatusPill({ status }: { status: WhatsAppMessageStatus }) {
  return <Badge tone={WHATSAPP_STATUS_TONE[status]}>{WHATSAPP_STATUS_LABEL[status]}</Badge>;
}

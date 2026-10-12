import {
  addDoc,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { activitiesCol } from "@/lib/data/collections";
import type { ActivityDoc, ActivityType } from "@/types";
import {
  CalendarClock,
  CircleCheck,
  StickyNote,
  ArrowRightLeft,
  UserCog,
  CalendarCheck,
  Phone,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import type { ComponentType } from "react";

export function subscribeActivities(
  leadId: string,
  onChange: (activities: ActivityDoc[]) => void
) {
  const q = query(activitiesCol(leadId), orderBy("at", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityDoc, "id">) }))
    );
  });
}

export function addActivity(
  leadId: string,
  byStaffId: string,
  data: Omit<ActivityDoc, "id" | "byStaffId" | "at"> & { at?: Timestamp }
) {
  return addDoc(activitiesCol(leadId), {
    ...data,
    byStaffId,
    at: data.at ?? serverTimestamp(),
  });
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  follow_up_planned: "Follow-up scheduled",
  follow_up_outcome: "Follow-up outcome",
  note: "Note",
  status_change: "Status changed",
  reassignment: "Reassigned",
  visit: "Visit",
  call_logged: "Call logged",
  whatsapp_logged: "WhatsApp logged",
  lead_created: "Lead created",
};

export const ACTIVITY_TYPE_ICON: Record<ActivityType, ComponentType<{ className?: string }>> = {
  follow_up_planned: CalendarClock,
  follow_up_outcome: CircleCheck,
  note: StickyNote,
  status_change: ArrowRightLeft,
  reassignment: UserCog,
  visit: CalendarCheck,
  call_logged: Phone,
  whatsapp_logged: MessageCircle,
  lead_created: Sparkles,
};

/** One-line summary of what actually happened — shared by the Lead Profile timeline
 * and the superadmin Audit Log, so the two never drift out of sync. */
export function formatActivityDetail(activity: ActivityDoc, staffName: (id: string | null) => string): string {
  switch (activity.type) {
    case "status_change":
      return `${activity.fromStatus ?? "—"} → ${activity.toStatus ?? "—"}`;
    case "reassignment":
      return `${staffName(activity.fromStaffId ?? null)} → ${staffName(activity.toStaffId ?? null)}${activity.reason ? ` (${activity.reason})` : ""}`;
    case "follow_up_planned":
      return `${activity.followUpType ?? ""} due ${activity.dueAt?.toDate().toLocaleString() ?? ""}`;
    case "follow_up_outcome":
      return `${activity.outcome ?? ""}${activity.outcomeNotes ? ` — ${activity.outcomeNotes}` : ""}`;
    case "visit":
      return `${activity.visitDate?.toDate().toLocaleString() ?? ""}${activity.visitNotes ? ` — ${activity.visitNotes}` : ""}`;
    case "note":
    case "lead_created":
    case "call_logged":
    case "whatsapp_logged":
      return activity.text ?? "";
    default:
      return "";
  }
}

/** Every activity across every lead, newest first — the Admin > Audit Log's "Lead
 * Changes" feed. Collection-group read is superadmin-only in practice (gated by the
 * Audit Log tab itself), though firestore.rules' own gate here is isAdmin()||isManagement(). */
export function subscribeAllActivities(onChange: (activities: (ActivityDoc & { leadId: string })[]) => void) {
  const q = query(collectionGroup(db, "activities"), orderBy("at", "desc"), limit(300));
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((d) => ({
        id: d.id,
        leadId: d.ref.parent.parent!.id,
        ...(d.data() as Omit<ActivityDoc, "id">),
      }))
    );
  });
}

import {
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { activitiesCol } from "@/lib/data/collections";
import type { ActivityDoc, ActivityType } from "@/types";

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

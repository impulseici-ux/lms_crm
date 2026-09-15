import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import { subscribeLead, changeLeadStatus, scheduleFollowUp, logFollowUpOutcome, logContact, addNote, recordVisit, confirmAdmission, reassignLead } from "@/lib/data/leads";
import { subscribeActivities, ACTIVITY_TYPE_LABELS } from "@/lib/data/activities";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { StatusPill, PriorityPill, FollowUpPill } from "@/components/Pills";
import { OPEN_STATUSES, CLOSED_STATUSES, isOpenStatus, type LeadDoc, type ActivityDoc, type FollowUpType, type FollowUpOutcome } from "@/types";

const FOLLOW_UP_TYPES: FollowUpType[] = ["Call", "WhatsApp", "Visit Reminder", "Email", "In-Person", "Other"];
const OUTCOMES: FollowUpOutcome[] = ["Reached", "No Answer", "Rescheduled", "Not Interested", "Converted to Visit"];

function toLocalInput(ts: Timestamp | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  d.setSeconds(0, 0);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export function LeadProfile() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { programName, branchName, campaignName, staffName, users } = useLookups();

  const [lead, setLead] = useState<LeadDoc | null | undefined>(undefined);
  const [activities, setActivities] = useState<ActivityDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) return;
    const unsub1 = subscribeLead(leadId, setLead);
    const unsub2 = subscribeActivities(leadId, setActivities);
    return () => { unsub1(); unsub2(); };
  }, [leadId]);

  // Editable "next action" state
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpType, setFollowUpType] = useState<FollowUpType>("Call");
  useEffect(() => {
    if (lead) {
      setFollowUpAt(toLocalInput(lead.nextFollowUpAt));
      setFollowUpType(lead.nextFollowUpType ?? "Call");
    }
  }, [lead?.id]);

  const [outcome, setOutcome] = useState<FollowUpOutcome>("Reached");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [noteText, setNoteText] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [admissionFeePlan, setAdmissionFeePlan] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  if (lead === undefined) return <div className="text-ink-soft">Loading…</div>;
  if (lead === null) return <div className="text-bad">Lead not found.</div>;

  const canEdit = role === "admin" || (role === "counsellor" && lead.assignedStaffId === user?.uid);

  const doAction = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
  };

  const waLink = `https://wa.me/${lead.parentPhone.replace(/[^0-9]/g, "")}`;

  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate(-1)} className="text-sm text-accent mb-4 hover:text-accent-strong">← Back</button>

      {/* Header strip */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">{lead.childName}</h1>
            <div className="text-ink-soft text-sm">Parent: {lead.parentName}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              <StatusPill status={lead.status} />
              <PriorityPill priority={lead.priority} />
              <FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} />
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`tel:${lead.parentPhone}`}
              onClick={() => user && doAction(() => logContact(lead, "call_logged", user.uid))}
            >
              <Button variant="secondary">📞 Call</Button>
            </a>
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              onClick={() => user && doAction(() => logContact(lead, "whatsapp_logged", user.uid))}
            >
              <Button variant="secondary">💬 WhatsApp</Button>
            </a>
          </div>
        </div>
        <div className="text-xs text-ink-faint mt-3">Assigned to {staffName(lead.assignedStaffId)}</div>
      </Card>

      {error && <div className="text-sm text-bad mb-4">{error}</div>}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Key facts */}
        <Card>
          <h2 className="font-semibold mb-3">Key facts</h2>
          <dl className="text-sm space-y-2">
            <Row label="Phone" value={lead.parentPhone} />
            <Row label="Email" value={lead.parentEmail ?? "—"} />
            <Row label="Child age" value={lead.childAge ?? "—"} />
            <Row label="Program" value={programName(lead.interestedProgramId)} />
            <Row label="Branch" value={branchName(lead.branchId)} />
            <Row label="Source" value={lead.sourceChannel} />
            <Row label="Campaign" value={lead.campaignId ? campaignName(lead.campaignId) : "—"} />
            <Row label="Enquiry date" value={lead.createdAt?.toDate().toLocaleString() ?? "—"} />
          </dl>
        </Card>

        {/* Next action */}
        <Card>
          <h2 className="font-semibold mb-3">Next action</h2>
          {canEdit ? (
            <>
              <Field label="Next follow-up">
                <Input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
              </Field>
              <Field label="Type">
                <Select value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}>
                  {FOLLOW_UP_TYPES.map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
              <Button
                variant="secondary"
                onClick={() =>
                  user && followUpAt &&
                  doAction(() => scheduleFollowUp(lead, Timestamp.fromDate(new Date(followUpAt)), followUpType, null, user.uid))
                }
              >
                Save follow-up
              </Button>

              <div className="border-t border-border-soft mt-4 pt-4">
                <div className="text-sm font-semibold mb-2">Log follow-up outcome</div>
                <Field label="Outcome">
                  <Select value={outcome} onChange={(e) => setOutcome(e.target.value as FollowUpOutcome)}>
                    {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                  </Select>
                </Field>
                <Textarea rows={2} placeholder="Notes" value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} />
                <Button
                  className="mt-2"
                  onClick={() =>
                    user && doAction(async () => {
                      await logFollowUpOutcome(lead, outcome, outcomeNotes || null, user.uid);
                      setOutcomeNotes("");
                    })
                  }
                >
                  Log outcome
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Only the assigned staff member or an admin can edit this lead.</p>
          )}
        </Card>
      </div>

      {canEdit && (
        <Card className="mb-6">
          <h2 className="font-semibold mb-3">Pipeline</h2>
          <div className="flex flex-wrap gap-2">
            {[...OPEN_STATUSES, ...CLOSED_STATUSES].map((s) => (
              <button
                key={s}
                disabled={s === lead.status}
                onClick={() =>
                  doAction(async () => {
                    if (isOpenStatus(s) && !lead.nextFollowUpAt && !followUpAt) {
                      throw new Error("Set a next follow-up date first — required for any open status.");
                    }
                    if (!user) return;
                    await changeLeadStatus(
                      lead,
                      s,
                      user.uid,
                      isOpenStatus(s) && followUpAt ? { nextFollowUpAt: Timestamp.fromDate(new Date(followUpAt)), nextFollowUpType: followUpType } : undefined
                    );
                  })
                }
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  s === lead.status
                    ? "bg-accent text-white border-accent"
                    : "bg-surface border-border text-ink-soft hover:border-accent hover:text-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Visit & admission inline */}
      {canEdit && (isOpenStatus(lead.status) ? ["Visit Scheduled", "Visit Completed", "Admission Discussion", "Admission Confirmed"].includes(lead.status) : false) && (
        <Card className="mb-6">
          <h2 className="font-semibold mb-3">Visit details</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Visit date">
              <Input type="datetime-local" value={visitDate || toLocalInput(lead.visitDate)} onChange={(e) => setVisitDate(e.target.value)} />
            </Field>
            <Field label="Visit notes">
              <Input value={visitNotes || lead.visitNotes || ""} onChange={(e) => setVisitNotes(e.target.value)} />
            </Field>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              user && visitDate &&
              doAction(() => recordVisit(lead, Timestamp.fromDate(new Date(visitDate)), visitNotes || null, user.uid))
            }
          >
            Save visit
          </Button>

          {["Admission Discussion", "Admission Confirmed"].includes(lead.status) && (
            <div className="border-t border-border-soft mt-4 pt-4">
              <h3 className="font-semibold text-sm mb-2">Admission</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Admission number">
                  <Input value={admissionNumber || lead.admissionNumber || ""} onChange={(e) => setAdmissionNumber(e.target.value)} />
                </Field>
                <Field label="Fee plan">
                  <Input value={admissionFeePlan || lead.admissionFeePlan || ""} onChange={(e) => setAdmissionFeePlan(e.target.value)} />
                </Field>
              </div>
              <Button
                onClick={() =>
                  user && admissionNumber &&
                  doAction(() => confirmAdmission(lead, admissionNumber, admissionFeePlan || null, user.uid))
                }
              >
                Confirm admission
              </Button>
            </div>
          )}
        </Card>
      )}

      {role === "admin" && (
        <Card className="mb-6">
          <h2 className="font-semibold mb-3">Reassign lead</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Reassign to">
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Select staff…</option>
                {users.filter((u) => u.id !== lead.assignedStaffId).map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reason (optional)">
              <Input value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} />
            </Field>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              user && reassignTo &&
              doAction(async () => {
                await reassignLead(lead, reassignTo, reassignReason || null, user.uid);
                setReassignTo(""); setReassignReason("");
              })
            }
          >
            Reassign
          </Button>
        </Card>
      )}

      {canEdit && (
        <Card className="mb-6">
          <h2 className="font-semibold mb-3">Internal note</h2>
          <Textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Staff-only — never shown to the parent." />
          <Button
            className="mt-2"
            variant="secondary"
            onClick={() => user && noteText && doAction(async () => { await addNote(lead, noteText, user.uid); setNoteText(""); })}
          >
            Add note
          </Button>
        </Card>
      )}

      {/* Unified timeline */}
      <Card>
        <h2 className="font-semibold mb-3">Activity timeline</h2>
        <div className="divide-y divide-border-soft">
          {activities.map((a) => (
            <TimelineEntry key={a.id} activity={a} staffName={staffName} />
          ))}
          {activities.length === 0 && <p className="text-sm text-ink-faint py-4">No activity yet.</p>}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}

function TimelineEntry({ activity, staffName }: { activity: ActivityDoc; staffName: (id: string | null) => string }) {
  const when = activity.at?.toDate().toLocaleString() ?? "";
  let detail = "";
  switch (activity.type) {
    case "status_change":
      detail = `${activity.fromStatus ?? "—"} → ${activity.toStatus ?? "—"}`;
      break;
    case "reassignment":
      detail = `${staffName(activity.fromStaffId ?? null)} → ${staffName(activity.toStaffId ?? null)}${activity.reason ? ` (${activity.reason})` : ""}`;
      break;
    case "follow_up_planned":
      detail = `${activity.followUpType ?? ""} due ${activity.dueAt?.toDate().toLocaleString() ?? ""}`;
      break;
    case "follow_up_outcome":
      detail = `${activity.outcome ?? ""}${activity.outcomeNotes ? ` — ${activity.outcomeNotes}` : ""}`;
      break;
    case "visit":
      detail = `${activity.visitDate?.toDate().toLocaleString() ?? ""}${activity.visitNotes ? ` — ${activity.visitNotes}` : ""}`;
      break;
    case "note":
    case "lead_created":
    case "call_logged":
    case "whatsapp_logged":
      detail = activity.text ?? "";
      break;
  }
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-sm">{ACTIVITY_TYPE_LABELS[activity.type]}</span>
        <span className="text-xs text-ink-faint">{when} · {staffName(activity.byStaffId)}</span>
      </div>
      {detail && <div className="text-sm text-ink-soft mt-0.5">{detail}</div>}
    </div>
  );
}

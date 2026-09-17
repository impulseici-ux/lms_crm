import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import {
  subscribeLead,
  changeLeadStatus,
  scheduleFollowUp,
  logFollowUpOutcome,
  logContact,
  addNote,
  recordVisit,
  confirmAdmission,
  reassignLead,
  updateLeadFields,
} from "@/lib/data/leads";
import { subscribeActivities } from "@/lib/data/activities";
import { Button, Card, Field, Input, Select, Textarea, IconTile, Skeleton } from "@/components/ui";
import { StatusPill, PriorityPill, FollowUpPill } from "@/components/Pills";
import {
  OPEN_STATUSES,
  CLOSED_STATUSES,
  type LeadDoc,
  type ActivityDoc,
  type ActivityType,
  type FollowUpType,
  type FollowUpOutcome,
} from "@/types";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Radio,
  Megaphone,
  Cake,
  BookOpen,
  Check,
  CalendarClock,
  CalendarCheck,
  StickyNote,
  UserCog,
  GraduationCap,
  RefreshCcw,
  ArrowRightLeft,
  Sparkles,
  CircleCheck,
  Pencil,
  Landmark,
  IndianRupee,
  Layers,
} from "lucide-react";
import type { ComponentType } from "react";

const FOLLOW_UP_TYPES: FollowUpType[] = ["Call", "WhatsApp", "Visit Reminder", "Email", "In-Person", "Other"];
const OUTCOMES: FollowUpOutcome[] = ["Reached", "No Answer", "Rescheduled", "Not Interested", "Converted to Visit"];

const ACTIVITY_ICON: Record<ActivityType, ComponentType<{ className?: string }>> = {
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

const ACTIVITY_LABEL: Record<ActivityType, string> = {
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

function toLocalInput(ts: Timestamp | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  d.setSeconds(0, 0);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
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
    return () => {
      unsub1();
      unsub2();
    };
  }, [leadId]);

  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpType, setFollowUpType] = useState<FollowUpType>("Call");
  useEffect(() => {
    if (lead) {
      setFollowUpAt(toLocalInput(lead.nextFollowUpAt));
      setFollowUpType(lead.nextFollowUpType ?? "Call");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [closingStatus, setClosingStatus] = useState("");
  const [editingFacts, setEditingFacts] = useState(false);
  const [editLocation, setEditLocation] = useState("");
  const [editFees, setEditFees] = useState("");

  if (lead === undefined) {
    return (
      <div className="max-w-5xl mx-auto">
        <Skeleton className="h-5 w-16 mb-4" />
        <Skeleton className="h-32 rounded-2xl mb-4" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }
  if (lead === null) return <div className="text-bad">Lead not found.</div>;

  const canEdit = role === "admin" || (role === "counsellor" && lead.assignedStaffId === user?.uid);
  const doAction = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };
  const waLink = `https://wa.me/${lead.parentPhone.replace(/[^0-9]/g, "")}`;
  const isVisitStage = ["Visit Scheduled", "Visit Completed", "Admission Discussion", "Admission Confirmed"].includes(lead.status);
  const stageIndex = OPEN_STATUSES.indexOf(lead.status as (typeof OPEN_STATUSES)[number]);

  const followUpValue = followUpAt ? Timestamp.fromDate(new Date(followUpAt)) : undefined;

  return (
    <div className="max-w-5xl mx-auto pb-8">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-accent mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-accent-soft text-accent-strong flex items-center justify-center text-lg font-bold shrink-0">
              {initials(lead.childName)}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold truncate">{lead.childName}</h1>
              <div className="text-ink-soft text-sm mt-0.5">Parent / guardian: {lead.parentName}</div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <StatusPill status={lead.status} />
                <PriorityPill priority={lead.priority} />
                <FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto shrink-0">
            <a href={`tel:${lead.parentPhone}`} onClick={() => user && doAction(() => logContact(lead, "call_logged", user.uid))} className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full"><Phone className="w-4 h-4" /> Call</Button>
            </a>
            <a href={waLink} target="_blank" rel="noreferrer" onClick={() => user && doAction(() => logContact(lead, "whatsapp_logged", user.uid))} className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full"><MessageCircle className="w-4 h-4" /> WhatsApp</Button>
            </a>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-faint mt-4 pt-3 border-t border-border-soft">
          <UserCog className="w-3.5 h-3.5" /> Assigned to <span className="font-semibold text-ink-soft">{staffName(lead.assignedStaffId)}</span>
        </div>
      </Card>

      {error && <div role="alert" className="rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-bad mb-4">{error}</div>}

      {/* Next action — impossible to miss */}
      <Card id="next-action" className="mb-4 border-accent/25 bg-accent-soft/40" padded={false}>
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <IconTile tone="accent" size="sm"><CalendarClock /></IconTile>
            <div>
              <h2 className="font-semibold text-ink">Next action</h2>
              <p className="text-xs text-ink-soft">{canEdit ? "What happens next, and when." : "Read-only — you don't own this lead."}</p>
            </div>
          </div>
          {canEdit ? (
            <>
              <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end mb-1">
                <Field label="Next follow-up">
                  <Input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
                </Field>
                <Field label="Type">
                  <Select value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}>
                    {FOLLOW_UP_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </Field>
                <Button
                  onClick={() => user && followUpValue && doAction(() => scheduleFollowUp(lead, followUpValue, followUpType, null, user.uid))}
                  className="mb-4 sm:mb-0"
                >
                  Save
                </Button>
              </div>

              <div className="border-t border-border-soft/70 mt-4 pt-4">
                <div className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><Check className="w-4 h-4 text-ink-faint" /> Log follow-up outcome</div>
                <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
                  <Field label="Outcome">
                    <Select value={outcome} onChange={(e) => setOutcome(e.target.value as FollowUpOutcome)}>
                      {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                    </Select>
                  </Field>
                  <Field label="Notes">
                    <Input placeholder="Optional" value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} />
                  </Field>
                  <Button
                    variant="secondary"
                    className="mb-4 sm:mb-0"
                    onClick={() =>
                      user &&
                      doAction(async () => {
                        await logFollowUpOutcome(lead, outcome, outcomeNotes || null, user.uid);
                        setOutcomeNotes("");
                      })
                    }
                  >
                    Log outcome
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Only the assigned staff member or an admin can edit this lead.</p>
          )}
        </div>
      </Card>

      {/* Key facts */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Key facts</h2>
          {canEdit && !editingFacts && (
            <button
              type="button"
              onClick={() => {
                setEditLocation(lead.location ?? "");
                setEditFees(lead.fees != null ? String(lead.fees) : "");
                setEditingFacts(true);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
          <FactRow icon={Phone} label="Phone" value={lead.parentPhone} />
          <FactRow icon={Mail} label="Email" value={lead.parentEmail ?? "—"} />
          <FactRow icon={Cake} label="Child age" value={lead.childAge ?? "—"} />
          <FactRow icon={BookOpen} label="Program" value={programName(lead.interestedProgramId)} />
          <FactRow icon={MapPin} label="Branch" value={branchName(lead.branchId)} />
          <FactRow icon={Radio} label="Source" value={lead.sourceChannel} />
          <FactRow icon={Megaphone} label="Campaign" value={lead.campaignId ? campaignName(lead.campaignId) : "—"} />
          <FactRow icon={CalendarClock} label="Enquiry date" value={lead.createdAt?.toDate().toLocaleString() ?? "—"} />
          {!editingFacts && <FactRow icon={Landmark} label="Location" value={lead.location ?? "—"} />}
          {!editingFacts && <FactRow icon={IndianRupee} label="Fees quoted" value={lead.fees != null ? `₹${lead.fees.toLocaleString("en-IN")}` : "—"} />}
          {lead.metaAds && (
            <FactRow
              icon={Layers}
              label="Meta ad"
              value={[lead.metaAds.adSetName, lead.metaAds.adName, lead.metaAds.formName].filter(Boolean).join(" / ") || "—"}
            />
          )}
        </div>
        {editingFacts && (
          <div className="grid sm:grid-cols-2 gap-x-5 mt-4 pt-4 border-t border-border-soft">
            <Field label="Location">
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="e.g. Singanallur" />
            </Field>
            <Field label="Fees quoted (₹)">
              <Input type="number" min="0" value={editFees} onChange={(e) => setEditFees(e.target.value)} />
            </Field>
            <div className="sm:col-span-2 flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  doAction(async () => {
                    await updateLeadFields(lead.id, {
                      location: editLocation.trim() || null,
                      fees: editFees.trim() ? Number(editFees) : null,
                    });
                    setEditingFacts(false);
                  })
                }
              >
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditingFacts(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Pipeline stepper */}
      {canEdit && (
        <Card className="mb-4">
          <h2 className="font-semibold mb-4">Pipeline</h2>
          <div className="flex items-center overflow-x-auto pb-2 -mx-1 px-1">
            {OPEN_STATUSES.map((s, i) => {
              const done = i < stageIndex || (i === stageIndex && lead.status === "Admission Confirmed");
              const current = s === lead.status;
              return (
                <div key={s} className="flex items-center shrink-0">
                  <button
                    type="button"
                    disabled={current}
                    onClick={() =>
                      doAction(async () => {
                        if (!lead.nextFollowUpAt && !followUpAt) throw new Error("Set a next follow-up date first — required for any open status.");
                        if (!user) return;
                        await changeLeadStatus(lead, s, user.uid, followUpValue ? { nextFollowUpAt: followUpValue, nextFollowUpType: followUpType } : undefined);
                      })
                    }
                    className={`flex flex-col items-center gap-1.5 px-2 group`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                        current
                          ? "bg-accent border-accent text-white"
                          : done
                          ? "bg-good border-good text-white"
                          : "bg-surface border-border text-ink-faint group-hover:border-accent group-hover:text-accent"
                      }`}
                    >
                      {done && !current ? <Check className="w-4 h-4" /> : i + 1}
                    </span>
                    <span className={`text-[11px] font-medium whitespace-nowrap ${current ? "text-accent-strong" : "text-ink-faint"}`}>{s}</span>
                  </button>
                  {i < OPEN_STATUSES.length - 1 && <div className={`w-6 sm:w-10 h-0.5 shrink-0 ${i < stageIndex ? "bg-good" : "bg-border"}`} />}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border-soft">
            <span className="text-xs font-semibold text-ink-faint shrink-0">Not moving forward?</span>
            <Select
              value={closingStatus}
              onChange={(e) => {
                const value = e.target.value;
                setClosingStatus("");
                if (!value) return;
                doAction(async () => {
                  if (!user) return;
                  await changeLeadStatus(lead, value as (typeof CLOSED_STATUSES)[number], user.uid);
                });
              }}
              className="text-xs py-1.5 max-w-xs"
            >
              <option value="">Close as…</option>
              {CLOSED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </Card>
      )}

      {/* Visit & admission */}
      {canEdit && isVisitStage && (
        <Card id="visit-details" className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            <IconTile tone="accent" size="sm"><CalendarCheck /></IconTile>
            <h2 className="font-semibold text-ink">Visit details</h2>
          </div>
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
            onClick={() => user && visitDate && doAction(() => recordVisit(lead, Timestamp.fromDate(new Date(visitDate)), visitNotes || null, user.uid))}
          >
            Save visit
          </Button>

          {["Admission Discussion", "Admission Confirmed"].includes(lead.status) && (
            <div className="border-t border-border-soft mt-5 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <IconTile tone="good" size="sm"><GraduationCap /></IconTile>
                <h3 className="font-semibold text-sm text-ink">Admission</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Admission number">
                  <Input value={admissionNumber || lead.admissionNumber || ""} onChange={(e) => setAdmissionNumber(e.target.value)} />
                </Field>
                <Field label="Fee plan">
                  <Input value={admissionFeePlan || lead.admissionFeePlan || ""} onChange={(e) => setAdmissionFeePlan(e.target.value)} />
                </Field>
              </div>
              <Button onClick={() => user && admissionNumber && doAction(() => confirmAdmission(lead, admissionNumber, admissionFeePlan || null, user.uid))}>
                Confirm admission
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Reassignment */}
      {role === "admin" && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            <IconTile tone="neutral" size="sm"><RefreshCcw /></IconTile>
            <h2 className="font-semibold text-ink">Reassign lead</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Reassign to">
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Select staff…</option>
                {users.filter((u) => u.id !== lead.assignedStaffId).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </Select>
            </Field>
            <Field label="Reason (optional)">
              <Input value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} />
            </Field>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              user &&
              reassignTo &&
              doAction(async () => {
                await reassignLead(lead, reassignTo, reassignReason || null, user.uid);
                setReassignTo("");
                setReassignReason("");
              })
            }
          >
            Reassign
          </Button>
        </Card>
      )}

      {/* Notes */}
      {canEdit && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <IconTile tone="neutral" size="sm"><StickyNote /></IconTile>
            <h2 className="font-semibold text-ink">Internal note</h2>
          </div>
          <Textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Staff-only — never shown to the parent." />
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => user && noteText && doAction(async () => { await addNote(lead, noteText, user.uid); setNoteText(""); })}
          >
            Add note
          </Button>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <h2 className="font-semibold mb-4">Activity timeline</h2>
        <div className="relative">
          {activities.map((a, i) => (
            <TimelineEntry key={a.id} activity={a} staffName={staffName} isLast={i === activities.length - 1} />
          ))}
          {activities.length === 0 && <p className="text-sm text-ink-faint py-4">No activity yet.</p>}
        </div>
      </Card>
    </div>
  );
}

function FactRow({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-ink-faint mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="font-medium text-ink truncate">{value}</div>
      </div>
    </div>
  );
}

function TimelineEntry({ activity, staffName, isLast }: { activity: ActivityDoc; staffName: (id: string | null) => string; isLast: boolean }) {
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
  const Icon = ACTIVITY_ICON[activity.type];
  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-8 h-8 rounded-full bg-surface-2 text-ink-soft flex items-center justify-center">
          <Icon className="w-[15px] h-[15px]" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border-soft my-1" />}
      </div>
      <div className="pb-5 min-w-0 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5">
          <span className="font-semibold text-sm">{ACTIVITY_LABEL[activity.type]}</span>
          <span className="text-xs text-ink-faint">{when} · {staffName(activity.byStaffId)}</span>
        </div>
        {detail && <div className="text-sm text-ink-soft mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}

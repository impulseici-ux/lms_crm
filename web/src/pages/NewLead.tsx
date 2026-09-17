import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import { useLeads } from "@/hooks/useLeads";
import { createLead } from "@/lib/data/leads";
import { Button, Card, Field, Input, Select, Textarea, SectionHeading } from "@/components/ui";
import type { FollowUpType, Priority } from "@/types";
import { AlertTriangle, CalendarClock, StickyNote, UserRound, ArrowRight } from "lucide-react";
import { normalizePhone } from "@/utils/phone";

const FOLLOW_UP_TYPES: FollowUpType[] = ["Call", "WhatsApp", "Visit Reminder", "Email", "In-Person", "Other"];

function defaultFollowUpLocal(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

function SectionCard({
  step,
  icon,
  title,
  description,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0 text-[13px] font-bold">
          {step}
        </div>
        <div className="min-w-0 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-ink-faint [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
            <h2 className="font-semibold text-ink">{title}</h2>
          </div>
          <p className="text-xs text-ink-faint mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export function NewLead() {
  const { user } = useAuth();
  const { leadSources, programs, branches, campaigns } = useLookups();
  const { leads } = useLeads();
  const navigate = useNavigate();

  const [sourceChannel, setSourceChannel] = useState("Walk-in");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [location, setLocation] = useState("");
  const [fees, setFees] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [referralName, setReferralName] = useState("");
  const [howHeardOther, setHowHeardOther] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState(defaultFollowUpLocal());
  const [followUpType, setFollowUpType] = useState<FollowUpType>("Call");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsReferralName = sourceChannel.startsWith("Referral");
  const needsOtherText = sourceChannel === "Other / Manual";
  const duplicateLeads = useMemo(() => {
    const phone = normalizePhone(parentPhone);
    if (phone.length < 10) return [];
    return leads.filter((lead) => normalizePhone(lead.parentPhone) === phone).slice(0, 3);
  }, [leads, parentPhone]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (!parentName.trim() || !parentPhone.trim() || !childName.trim() || !childAge.trim() || !programId || !followUpAt) {
      setError("Please fill in all required fields, including the next follow-up.");
      return;
    }
    setBusy(true);
    try {
      const leadId = await createLead(
        {
          parentName: parentName.trim(),
          parentPhone: parentPhone.trim(),
          parentEmail: parentEmail.trim() || null,
          childName: childName.trim(),
          childAge: childAge.trim(),
          interestedProgramId: programId,
          branchId: branchId || null,
          location: location.trim() || null,
          fees: fees.trim() ? Number(fees) : null,
          sourceChannel,
          campaignId: campaignId || null,
          referralName: needsReferralName ? referralName.trim() || null : null,
          howHeardOther: needsOtherText ? howHeardOther.trim() || null : null,
          priority,
          notes: notes.trim() || null,
          nextFollowUpAt: Timestamp.fromDate(new Date(followUpAt)),
          nextFollowUpType: followUpType,
        },
        user.uid
      );
      navigate(`/leads/${leadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this lead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-24 sm:pb-8">
      <SectionHeading eyebrow="New enquiry" title="Log a lead" description="Capture the enquiry quickly, then make sure the next action is scheduled." />

      <form onSubmit={onSubmit} className="space-y-5">
        <SectionCard step={1} icon={<UserRound />} title="Enquiry details" description="Where it came from, and the parent's contact information.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
            <Field label="How did the enquiry arrive?">
              <Select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value)}>
                {leadSources.length === 0 ? (
                  <option value="Walk-in">Walk-in</option>
                ) : (
                  leadSources.filter((s) => s.active).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)
                )}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </Select>
            </Field>
            <Field label="Parent / guardian name *">
              <Input required value={parentName} onChange={(e) => setParentName(e.target.value)} autoFocus autoComplete="name" />
            </Field>
            <Field label="Phone number *" hint="We'll warn you if this number already exists in the CRM.">
              <Input required value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
            </Field>

            {duplicateLeads.length > 0 && (
              <div className="md:col-span-2 -mt-1 mb-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3.5 flex gap-3">
                <AlertTriangle className="w-[18px] h-[18px] text-warn shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">Possible duplicate enquiry</div>
                  <div className="text-xs text-ink-soft mt-1">
                    This phone number already exists for {duplicateLeads.map((lead) => `${lead.parentName} · ${lead.childName}`).join(", ")}. Check the existing lead before creating another record.
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {duplicateLeads.map((lead) => (
                      <button key={lead.id} type="button" onClick={() => navigate(`/leads/${lead.id}`)} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong">
                        Open {lead.childName} <ArrowRight className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Field label="Email">
              <Input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} autoComplete="email" />
            </Field>
            {needsReferralName && (
              <Field label={sourceChannel === "Referral — Staff" ? "Referring staff member" : "Referring parent's name"}>
                <Input value={referralName} onChange={(e) => setReferralName(e.target.value)} />
              </Field>
            )}
            {needsOtherText && (
              <Field label="Please specify *">
                <Input required value={howHeardOther} onChange={(e) => setHowHeardOther(e.target.value)} />
              </Field>
            )}
          </div>
        </SectionCard>

        <SectionCard step={2} icon={<UserRound />} title="Child & program" description="Who this enquiry is for, and what they're interested in.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
            <Field label="Child's name *">
              <Input required value={childName} onChange={(e) => setChildName(e.target.value)} />
            </Field>
            <Field label="Child's age *">
              <Input required value={childAge} onChange={(e) => setChildAge(e.target.value)} placeholder="e.g. 4 years" />
            </Field>
            <Field label="Interested program *">
              <Select required value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="" disabled>Select a program</option>
                {programs.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            {branches.length > 0 && (
              <Field label="Branch">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">—</option>
                  {branches.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Campaign (optional)">
              <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">None</option>
                {campaigns.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Location" hint="Area / locality, if different from branch.">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Singanallur" />
            </Field>
            <Field label="Fees quoted (₹)">
              <Input type="number" min="0" inputMode="numeric" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="e.g. 12000" />
            </Field>
          </div>
        </SectionCard>

        <SectionCard step={3} icon={<CalendarClock />} title="Next follow-up — required" description="Every new enquiry needs a clear next action.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
            <Field label="Date & time *">
              <Input type="datetime-local" required value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
            </Field>
            <Field label="Follow-up type">
              <Select value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}>
                {FOLLOW_UP_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard step={4} icon={<StickyNote />} title="Notes" description="Optional context for whoever handles this enquiry next.">
          <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Parent's requirement, preferred timing, questions, etc." />
        </SectionCard>

        {error && (
          <div role="alert" className="rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-bad">
            {error}
          </div>
        )}

        <div className="hidden sm:flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className="min-w-36">
            {busy ? "Saving…" : "Save Lead"}
          </Button>
        </div>

        <div className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-border-soft p-3 flex gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className="flex-1">
            {busy ? "Saving…" : "Save Lead"}
          </Button>
        </div>
      </form>
    </div>
  );
}

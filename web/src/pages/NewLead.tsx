import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import { createLead } from "@/lib/data/leads";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { FollowUpType, Priority } from "@/types";

const FOLLOW_UP_TYPES: FollowUpType[] = ["Call", "WhatsApp", "Visit Reminder", "Email", "In-Person", "Other"];

function defaultFollowUpLocal(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export function NewLead() {
  const { user } = useAuth();
  const { leadSources, programs, branches, campaigns } = useLookups();
  const navigate = useNavigate();

  const [sourceChannel, setSourceChannel] = useState("Walk-in");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (!parentName || !parentPhone || !childName || !childAge || !programId || !followUpAt) {
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
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold">New Enquiry</h1>
        <p className="text-ink-soft mt-1 text-sm">
          Capture the enquiry quickly, then make sure the next action is scheduled.
        </p>
      </div>

      <Card className="p-4 sm:p-6">
        <form onSubmit={onSubmit} className="space-y-6">
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-ink">Enquiry details</h2>
                <p className="text-xs text-ink-faint mt-0.5">Start with the parent and child information.</p>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Required fields *</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
              <Field label="How did the enquiry arrive?">
                <Select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value)}>
                  {leadSources.length === 0
                    ? <option value="Walk-in">Walk-in</option>
                    : leadSources.filter((s) => s.active).map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
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
              <Field label="Phone number *" hint="Use the same number consistently so duplicate checks can be added later.">
                <Input required value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
              </Field>
              <Field label="Email">
                <Input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Child's name *">
                <Input required value={childName} onChange={(e) => setChildName(e.target.value)} />
              </Field>
              <Field label="Child's age *">
                <Input required value={childAge} onChange={(e) => setChildAge(e.target.value)} placeholder="e.g. 4 years" />
              </Field>
              <Field label="Interested program *">
                <Select required value={programId} onChange={(e) => setProgramId(e.target.value)}>
                  <option value="" disabled>Select a program</option>
                  {programs.filter((p) => p.active).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </Field>
              {branches.length > 0 && (
                <Field label="Branch">
                  <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">—</option>
                    {branches.filter((b) => b.active).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Campaign (optional)">
                <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">None</option>
                  {campaigns.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
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
          </section>

          <section className="rounded-xl border border-accent/20 bg-accent-soft/40 p-4 sm:p-5">
            <div className="mb-4">
              <h2 className="font-semibold text-ink">Next follow-up <span className="text-bad">*</span></h2>
              <p className="text-xs text-ink-soft mt-0.5">Every new enquiry should have a clear next action.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
              <Field label="Date & time *">
                <Input
                  type="datetime-local"
                  required
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                />
              </Field>
              <Field label="Follow-up type">
                <Select value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}>
                  {FOLLOW_UP_TYPES.map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <Field label="Notes" hint="Add useful context for the next person handling this enquiry.">
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Parent's requirement, preferred timing, questions, etc." />
            </Field>
          </section>

          {error && (
            <div role="alert" className="rounded-lg border border-bad/20 bg-bad-soft px-3 py-2.5 text-sm text-bad">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1 border-t border-border-soft">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={busy} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="w-full sm:w-auto min-w-36">
              {busy ? "Saving…" : "Save Lead"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

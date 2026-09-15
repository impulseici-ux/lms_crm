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
          parentName,
          parentPhone,
          parentEmail: parentEmail || null,
          childName,
          childAge,
          interestedProgramId: programId,
          branchId: branchId || null,
          sourceChannel,
          campaignId: campaignId || null,
          referralName: needsReferralName ? referralName || null : null,
          howHeardOther: needsOtherText ? howHeardOther || null : null,
          priority,
          notes: notes || null,
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
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold mb-1">New Enquiry</h1>
      <p className="text-ink-soft mb-6 text-sm">
        Optimized for speed — a walk-in or phone enquiry should take under 30 seconds to log.
      </p>

      <Card>
        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-x-4">
            <div className="col-span-2">
              <Field label="How did the enquiry arrive?">
                <Select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value)}>
                  {leadSources.length === 0
                    ? <option value="Walk-in">Walk-in</option>
                    : leadSources.filter((s) => s.active).map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                </Select>
              </Field>
            </div>

            <Field label="Parent / guardian name *">
              <Input required value={parentName} onChange={(e) => setParentName(e.target.value)} autoFocus />
            </Field>
            <Field label="Phone number *" hint="Also used for duplicate detection.">
              <Input required value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} inputMode="tel" />
            </Field>
            <Field label="Email">
              <Input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
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
              <div className="col-span-2">
                <Field label="Please specify *">
                  <Input required value={howHeardOther} onChange={(e) => setHowHeardOther(e.target.value)} />
                </Field>
              </div>
            )}
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </Select>
            </Field>
          </div>

          <div className="border-t border-border-soft mt-2 pt-4">
            <div className="text-sm font-semibold text-ink mb-3">Next follow-up — required</div>
            <div className="grid grid-cols-2 gap-x-4">
              <Field label="Date & time *">
                <Input
                  type="datetime-local"
                  required
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                />
              </Field>
              <Field label="Type">
                <Select value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}>
                  {FOLLOW_UP_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <Field label="Notes">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && <div className="text-sm text-bad mb-4">{error}</div>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Saving…" : "Save Lead"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

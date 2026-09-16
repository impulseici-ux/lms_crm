import { useState, type FormEvent } from "react";
import { useLookups } from "@/hooks/useLookups";
import { addLeadSource, addProgram, addBranch, addCampaign, setActive } from "@/lib/data/lookups";
import { setUserRole } from "@/lib/data/users";
import { Button, Card, Field, Input, Select, SectionHeading, EmptyState, IconTile } from "@/components/ui";
import type { Role } from "@/types";
import { Radio, BookOpen, MapPin, Megaphone, Users, AlertTriangle, Plus, ListChecks } from "lucide-react";
import type { ComponentType } from "react";

const TABS: { key: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "Lead Sources", icon: Radio },
  { key: "Programs", icon: BookOpen },
  { key: "Branches", icon: MapPin },
  { key: "Campaigns", icon: Megaphone },
  { key: "Staff", icon: Users },
];
type Tab = (typeof TABS)[number]["key"];

export function Admin() {
  const [tab, setTab] = useState<Tab>("Lead Sources");
  const lookups = useLookups();

  return (
    <div className="max-w-4xl mx-auto pb-8">
      <SectionHeading eyebrow="Configuration" title="Admin Settings" description="Manage the CRM lists, campaigns and staff access." />

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 text-[13px] font-semibold px-3.5 py-2 rounded-xl border transition-colors ${
                active ? "bg-accent-soft text-accent-strong border-accent/30" : "bg-surface text-ink-soft border-border hover:border-ink-faint/40 hover:text-ink"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.key}
            </button>
          );
        })}
      </div>

      {tab === "Lead Sources" && (
        <SimpleListEditor icon={Radio} items={lookups.leadSources} onAdd={(name) => addLeadSource(name, lookups.leadSources.length)} onToggle={(id, active) => setActive("leadSources", id, active)} placeholder="e.g. Snapchat Ads" />
      )}
      {tab === "Programs" && (
        <SimpleListEditor icon={BookOpen} items={lookups.programs} onAdd={(name) => addProgram(name, lookups.programs.length)} onToggle={(id, active) => setActive("programs", id, active)} placeholder="e.g. Grade 3" />
      )}
      {tab === "Branches" && (
        <SimpleListEditor icon={MapPin} items={lookups.branches} onAdd={(name) => addBranch(name)} onToggle={(id, active) => setActive("branches", id, active)} placeholder="e.g. Singanallur" />
      )}
      {tab === "Campaigns" && <CampaignsEditor />}
      {tab === "Staff" && <StaffEditor />}
    </div>
  );
}

function SimpleListEditor({
  icon: Icon,
  items,
  onAdd,
  onToggle,
  placeholder,
}: {
  icon: ComponentType<{ className?: string }>;
  items: { id: string; name: string; active: boolean }[];
  onAdd: (name: string) => Promise<unknown>;
  onToggle: (id: string, active: boolean) => Promise<unknown>;
  placeholder: string;
}) {
  const [name, setName] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName("");
  };
  return (
    <Card padded={false}>
      <div className="p-5 border-b border-border-soft">
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className="flex-1" />
          <Button type="submit" className="w-full sm:w-auto">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </form>
      </div>
      <div className="divide-y divide-border-soft">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <IconTile tone={item.active ? "accent" : "neutral"} size="sm"><Icon /></IconTile>
              <span className={`min-w-0 truncate font-medium ${item.active ? "text-ink" : "text-ink-faint line-through"}`}>{item.name}</span>
            </div>
            <button type="button" className="shrink-0 text-xs font-semibold text-accent hover:text-accent-strong" onClick={() => onToggle(item.id, !item.active)}>
              {item.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
        {items.length === 0 && <EmptyState icon={<Icon />} title="Nothing here yet" description="Add your first entry using the form above." />}
      </div>
    </Card>
  );
}

function CampaignsEditor() {
  const { campaigns, leadSources } = useLookups();
  const [name, setName] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addCampaign(name.trim(), channels, null, null, null);
    setName("");
    setChannels([]);
  };
  return (
    <Card padded={false}>
      <div className="p-5 border-b border-border-soft">
        <form onSubmit={submit}>
          <Field label="Campaign name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vijayadasami Admission Campaign 2026" />
          </Field>
          <Field label="Channels it runs on">
            <select
              multiple
              value={channels}
              onChange={(e) => setChannels(Array.from(e.target.selectedOptions, (o) => o.value))}
              className="w-full min-h-32 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm shadow-[var(--shadow-card)]"
            >
              {leadSources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <span className="block text-xs text-ink-faint mt-1.5">Hold Ctrl/Cmd to select multiple channels.</span>
          </Field>
          <Button type="submit">
            <Plus className="w-4 h-4" /> Add campaign
          </Button>
        </form>
      </div>
      <div className="divide-y divide-border-soft">
        {campaigns.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-3.5">
            <IconTile tone="accent" size="sm"><Megaphone /></IconTile>
            <div className="min-w-0">
              <div className="font-medium text-ink truncate">{c.name}</div>
              <div className="text-xs text-ink-faint mt-0.5 truncate">{c.channels.join(", ") || "No channels set"}</div>
            </div>
          </div>
        ))}
        {campaigns.length === 0 && <EmptyState icon={<Megaphone />} title="No campaigns yet" description="Add your first marketing push above." />}
      </div>
    </Card>
  );
}

const ROLES: Role[] = ["admin", "counsellor", "management"];

function StaffEditor() {
  const { users, branches } = useLookups();
  const [uid, setUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("counsellor");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!uid.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await setUserRole({ uid: uid.trim(), role, displayName: displayName.trim() || undefined, branchId: branchId || null });
      setUid("");
      setDisplayName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <IconTile tone="accent" size="sm"><Users /></IconTile>
          <h2 className="font-semibold text-ink">Set staff role</h2>
        </div>
        <p className="text-xs text-ink-faint mb-3 ml-[42px]">Create the account in Firebase Auth first, then paste its UID here to grant a role.</p>
        <div className="flex gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
          <p className="text-xs text-ink-soft">
            This calls a Cloud Function, which requires the Blaze plan. On the free Spark plan use <code className="font-mono bg-surface px-1 py-0.5 rounded">scripts/set-role.mjs</code> from the repo instead.
          </p>
        </div>
        <form onSubmit={submit}>
          <Field label="Firebase Auth UID">
            <Input value={uid} onChange={(e) => setUid(e.target.value)} required />
          </Field>
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            {branches.length > 0 && (
              <Field label="Branch">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
          {error && <div className="text-sm text-bad mb-3">{error}</div>}
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save role"}</Button>
        </form>
      </Card>

      <Card padded={false}>
        <div className="flex items-center gap-2.5 p-5 pb-4">
          <IconTile tone="neutral" size="sm"><ListChecks /></IconTile>
          <h2 className="font-semibold text-ink">Staff directory</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide"><th className="pb-2 pl-5">Name</th><th className="pb-2">Role</th><th className="pb-2 pr-5">Active</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border-soft">
                  <td className="py-2.5 pl-5 font-medium">{u.displayName}</td>
                  <td className="py-2.5 capitalize">{u.role}</td>
                  <td className="py-2.5 pr-5">{u.active ? <span className="text-good font-semibold">Yes</span> : <span className="text-ink-faint">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <EmptyState icon={<Users />} title="No staff yet" description="Grant your first role using the form above." />}
        </div>
      </Card>
    </div>
  );
}

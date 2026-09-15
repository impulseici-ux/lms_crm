import { useState, type FormEvent } from "react";
import { useLookups } from "@/hooks/useLookups";
import { addLeadSource, addProgram, addBranch, addCampaign, setActive } from "@/lib/data/lookups";
import { setUserRole } from "@/lib/data/users";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import type { Role } from "@/types";

const TABS = ["Lead Sources", "Programs", "Branches", "Campaigns", "Staff"] as const;
type Tab = (typeof TABS)[number];

export function Admin() {
  const [tab, setTab] = useState<Tab>("Lead Sources");
  const lookups = useLookups();

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-4">Admin Settings</h1>
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm font-semibold px-3 py-1.5 rounded-full ${tab === t ? "bg-accent-soft text-accent-strong" : "text-ink-soft hover:bg-surface-2"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Lead Sources" && (
        <SimpleListEditor
          items={lookups.leadSources}
          onAdd={(name) => addLeadSource(name, lookups.leadSources.length)}
          onToggle={(id, active) => setActive("leadSources", id, active)}
          placeholder="e.g. Snapchat Ads"
        />
      )}
      {tab === "Programs" && (
        <SimpleListEditor
          items={lookups.programs}
          onAdd={(name) => addProgram(name, lookups.programs.length)}
          onToggle={(id, active) => setActive("programs", id, active)}
          placeholder="e.g. Grade 3"
        />
      )}
      {tab === "Branches" && (
        <SimpleListEditor
          items={lookups.branches}
          onAdd={(name) => addBranch(name)}
          onToggle={(id, active) => setActive("branches", id, active)}
          placeholder="e.g. Singanallur"
        />
      )}
      {tab === "Campaigns" && <CampaignsEditor />}
      {tab === "Staff" && <StaffEditor />}
    </div>
  );
}

function SimpleListEditor({
  items,
  onAdd,
  onToggle,
  placeholder,
}: {
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
    <Card>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
        <Button type="submit">Add</Button>
      </form>
      <div className="divide-y divide-border-soft">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-2">
            <span className={item.active ? "" : "text-ink-faint line-through"}>{item.name}</span>
            <button
              className="text-xs font-semibold text-accent hover:text-accent-strong"
              onClick={() => onToggle(item.id, !item.active)}
            >
              {item.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-faint py-2">Nothing here yet.</p>}
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
    setName(""); setChannels([]);
  };

  return (
    <Card>
      <form onSubmit={submit} className="mb-4">
        <Field label="Campaign name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vijayadasami Admission Campaign 2026" />
        </Field>
        <Field label="Channels it runs on">
          <select
            multiple
            value={channels}
            onChange={(e) => setChannels(Array.from(e.target.selectedOptions, (o) => o.value))}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
          >
            {leadSources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
        <Button type="submit">Add campaign</Button>
      </form>
      <div className="divide-y divide-border-soft">
        {campaigns.map((c) => (
          <div key={c.id} className="py-2">
            <div className="font-medium">{c.name}</div>
            <div className="text-xs text-ink-faint">{c.channels.join(", ") || "No channels set"}</div>
          </div>
        ))}
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
      await setUserRole({ uid: uid.trim(), role, displayName: displayName || undefined, branchId: branchId || null });
      setUid(""); setDisplayName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Card className="mb-6">
        <h2 className="font-semibold mb-3">Set staff role</h2>
        <p className="text-xs text-ink-faint mb-3">
          Create the account in Firebase Auth first (console or emulator UI), then paste its UID here to grant a role.
        </p>
        <form onSubmit={submit}>
          <Field label="Firebase Auth UID">
            <Input value={uid} onChange={(e) => setUid(e.target.value)} required />
          </Field>
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
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

      <Card>
        <h2 className="font-semibold mb-3">Staff directory</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-faint text-xs uppercase"><th className="pb-2">Name</th><th>Role</th><th>Active</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border-soft">
                <td className="py-2">{u.displayName}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2">{u.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

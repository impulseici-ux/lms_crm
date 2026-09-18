import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useToast } from "@/context/ToastContext";
import { useLookups } from "@/hooks/useLookups";
import { addLeadSource, addProgram, addBranch, addCampaign, setActive } from "@/lib/data/lookups";
import { setUserRole } from "@/lib/data/users";
import { subscribeSyncConfig, subscribeSyncRuns } from "@/lib/data/sync";
import { inviteUser, resendActivationCode, setUserActive, type IssueCodeResult } from "@/lib/data/onboarding";
import { Button, Card, Field, Input, Select, SectionHeading, EmptyState, IconTile, Badge } from "@/components/ui";
import type { Role, SyncConfigDoc, SyncRunDoc, UserStatus, UserDoc } from "@/types";
import { resolveUserStatus } from "@/types";
import {
  Radio,
  BookOpen,
  MapPin,
  Megaphone,
  Users,
  AlertTriangle,
  Plus,
  ListChecks,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  UserPlus,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Ban,
  Power,
} from "lucide-react";
import type { ComponentType } from "react";

const TABS: { key: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "Lead Sources", icon: Radio },
  { key: "Programs", icon: BookOpen },
  { key: "Branches", icon: MapPin },
  { key: "Campaigns", icon: Megaphone },
  { key: "Staff", icon: Users },
  { key: "Integrations", icon: RefreshCw },
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
      {tab === "Integrations" && <IntegrationsPanel />}
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
  const { showToast } = useToast();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName("");
    showToast("Saved");
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
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addCampaign(name.trim(), channels, null, null, null);
    setName("");
    setChannels([]);
    showToast("Saved");
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

/**
 * Part 1/2: no password field here — an admin never sets or sees a new
 * user's password. This only creates the account (Pending Activation) and
 * attempts to send a one-time WhatsApp code; the user sets their own
 * password later, in the separate /activate flow.
 */
function InviteUserCard() {
  const { branches } = useLookups();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<Role>("counsellor");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IssueCodeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setFullName("");
    setMobile("");
    setRole("counsellor");
    setBranchId("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !mobile.trim()) return;
    setBusy(true);
    try {
      const created = await inviteUser({ fullName: fullName.trim(), mobile: mobile.trim(), role, branchId: branchId || null });
      setResult(created);
      reset();
      showToast(created.whatsappStatus === "sent" ? "Activation code sent" : "User created — activation code could not be sent via WhatsApp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this user.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!result?.fallbackCode) return;
    await navigator.clipboard.writeText(result.fallbackCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <div className="flex items-center gap-2.5 mb-1">
        <IconTile tone="accent" size="sm"><UserPlus /></IconTile>
        <div>
          <h2 className="font-semibold text-ink">Invite user</h2>
          <p className="text-xs text-ink-faint">Set up login access for a new Staff or Manager.</p>
        </div>
      </div>

      {result ? (
        <div className="mt-4">
          {result.whatsappStatus === "sent" ? (
            <div className="flex gap-2.5 rounded-xl border border-good/25 bg-good-soft px-4 py-3 mb-3">
              <CheckCircle2 className="w-4 h-4 text-good shrink-0 mt-0.5" />
              <p className="text-sm text-ink">
                <span className="font-semibold">{result.email}</span> was created and their activation code was sent via WhatsApp.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 mb-3">
                <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                <p className="text-sm text-ink">
                  <span className="font-semibold">{result.email}</span> was created, but the activation code could not be sent via
                  WhatsApp{result.whatsappError ? `: ${result.whatsappError}` : "."} They remain <em>Pending Activation</em>.
                </p>
              </div>
              {result.fallbackCode && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 mb-3">
                  <span className="text-xs text-ink-faint shrink-0">Share this code with them for now:</span>
                  <code className="flex-1 font-mono text-sm font-bold text-ink tracking-widest">{result.fallbackCode}</code>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong"
                  >
                    {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
              )}
            </>
          )}
          <Button size="sm" variant="secondary" onClick={() => setResult(null)}>Invite another</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="off" />
            </Field>
            <Field label="WhatsApp / mobile number" hint="10-digit Indian number, or include a country code.">
              <Input value={mobile} onChange={(e) => setMobile(e.target.value)} required inputMode="tel" autoComplete="off" />
            </Field>
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
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create User & Send Activation Code"}</Button>
        </form>
      )}
    </Card>
  );
}

function AdvancedRoleEditor() {
  const { branches } = useLookups();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
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
      showToast("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2.5">
          <IconTile tone="neutral" size="sm"><Users /></IconTile>
          <h2 className="font-semibold text-ink">Advanced: update an existing account by UID</h2>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-ink-faint" /> : <ChevronDown className="w-4 h-4 text-ink-faint" />}
      </button>
      {expanded && (
        <div className="mt-4">
          <p className="text-xs text-ink-faint mb-3">
            For an account that already has a login (e.g. re-running activation, or changing someone's role/branch later). Paste its
            Firebase Auth UID — find it under Firebase Console → Authentication.
          </p>
          <div className="flex gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
            <p className="text-xs text-ink-soft">
              This "Save role" button calls a Cloud Function, which requires the Blaze plan. On the free Spark plan, use{" "}
              <code className="font-mono bg-surface px-1 py-0.5 rounded">scripts/set-role.mjs</code> from the repo instead.
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
        </div>
      )}
    </Card>
  );
}

const STATUS_BADGE: Record<UserStatus, { label: string; tone: "good" | "warn" | "accent" | "neutral" }> = {
  pending_activation: { label: "Pending Activation", tone: "warn" },
  password_setup_required: { label: "Password Setup Required", tone: "accent" },
  active: { label: "Active", tone: "good" },
  inactive: { label: "Inactive", tone: "neutral" },
};

function StaffRow({ user, onChanged }: { user: UserDoc; onChanged: (message: string) => void }) {
  const status = resolveUserStatus(user.status);
  const badge = STATUS_BADGE[status];
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const doResend = async () => {
    setBusy(true);
    setRowError(null);
    try {
      const result = await resendActivationCode(user.id);
      onChanged(
        result.whatsappStatus === "sent"
          ? "Activation code resent via WhatsApp."
          : `Code regenerated, but WhatsApp send failed${result.fallbackCode ? ` — new code: ${result.fallbackCode}` : "."}`
      );
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    setRowError(null);
    try {
      await setUserActive(user.id, status === "inactive");
      onChanged(status === "inactive" ? "Account reactivated." : "Account deactivated.");
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Could not update this account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-t border-border-soft align-top">
      <td className="py-2.5 pl-5 font-medium">
        {user.displayName}
        {rowError && <div className="text-xs text-bad font-normal mt-0.5">{rowError}</div>}
      </td>
      <td className="py-2.5 text-ink-soft">{user.mobile ?? "—"}</td>
      <td className="py-2.5 capitalize">{user.role}</td>
      <td className="py-2.5">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {status === "pending_activation" && user.mobile && (
          <div className="flex items-center gap-1 mt-1 text-[11px] text-ink-faint">
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </div>
        )}
      </td>
      <td className="py-2.5 pr-5">
        <div className="flex flex-wrap gap-2 justify-end">
          {status === "pending_activation" && (
            <button
              type="button"
              disabled={busy}
              onClick={doResend}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" /> Resend code
            </button>
          )}
          {(status === "active" || status === "inactive") && (
            <button
              type="button"
              disabled={busy}
              onClick={toggleActive}
              className={`inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-50 ${
                status === "active" ? "text-bad hover:text-bad" : "text-good hover:text-good"
              }`}
            >
              {status === "active" ? <><Ban className="w-3 h-3" /> Deactivate</> : <><Power className="w-3 h-3" /> Activate</>}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function StaffEditor() {
  const { users } = useLookups();
  const { showToast } = useToast();
  const [staffQuery, setStaffQuery] = useState("");

  return (
    <div className="space-y-5">
      <InviteUserCard />
      <AdvancedRoleEditor />

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 p-5 pb-4">
          <div className="flex items-center gap-2.5">
            <IconTile tone="neutral" size="sm"><ListChecks /></IconTile>
            <h2 className="font-semibold text-ink">Staff directory</h2>
          </div>
          <div className="relative w-full max-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
            <input
              value={staffQuery}
              onChange={(e) => setStaffQuery(e.target.value)}
              placeholder="Search staff…"
              className="w-full rounded-lg border border-border bg-surface pl-8 pr-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide">
                <th className="pb-2 pl-5">Name</th>
                <th className="pb-2">Mobile</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter((u) => u.displayName.toLowerCase().includes(staffQuery.trim().toLowerCase()))
                .map((u) => (
                  <StaffRow key={u.id} user={u} onChanged={showToast} />
                ))}
            </tbody>
          </table>
          {users.length === 0 && <EmptyState icon={<Users />} title="No staff yet" description="Invite your first staff member using the form above." />}
        </div>
      </Card>
    </div>
  );
}

function formatTimestamp(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

/**
 * Read-only view of the Google Sheets → Meta Ads lead sync (scripts/sync-google-sheets-leads.mjs,
 * scheduled by .github/workflows/sync-leads.yml). No credentials live here — this panel only
 * reads the status/history documents the sync script itself writes via the Admin SDK.
 */
function IntegrationsPanel() {
  const [config, setConfig] = useState<SyncConfigDoc | null>(null);
  const [runs, setRuns] = useState<SyncRunDoc[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubs = [
      subscribeSyncConfig((c) => {
        setConfig(c);
        setLoaded(true);
      }),
      subscribeSyncRuns(setRuns, 10),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const configured = !!config?.spreadsheetId;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <IconTile tone="accent" size="sm"><RefreshCw /></IconTile>
          <h2 className="font-semibold text-ink">Google Sheets — Meta Ads lead sync</h2>
        </div>
        <p className="text-xs text-ink-faint mb-4 ml-[42px]">
          New rows in your Meta Ads lead sheet are imported automatically into Enquiries, sourced as "Meta Ads". Runs on a schedule via
          GitHub Actions — no Blaze plan required.
        </p>

        {!loaded ? (
          <div className="text-sm text-ink-faint">Loading…</div>
        ) : !configured ? (
          <div className="flex gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
            <p className="text-xs text-ink-soft">
              Not configured yet. Set up the Google service account and repo secrets described in README.md ("Google Sheets lead sync"),
              then trigger the <code className="font-mono bg-surface px-1 py-0.5 rounded">Sync Google Sheets Leads</code> workflow once
              from the GitHub Actions tab to run the initial import.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Last sync" value={formatTimestamp(config?.lastSyncAt)} />
            <Stat
              label="Last status"
              value={
                config?.lastSyncStatus === "success" ? (
                  <span className="inline-flex items-center gap-1 text-good"><CheckCircle2 className="w-3.5 h-3.5" /> Success</span>
                ) : config?.lastSyncStatus === "failed" ? (
                  <span className="inline-flex items-center gap-1 text-bad"><XCircle className="w-3.5 h-3.5" /> Failed</span>
                ) : (
                  "—"
                )
              }
            />
            <Stat label="Imported (all-time)" value={String(config?.totalImported ?? 0)} />
            <Stat label="Duplicates skipped" value={String(config?.totalDuplicates ?? 0)} />
          </div>
        )}
      </Card>

      <Card padded={false}>
        <div className="flex items-center gap-2.5 p-5 pb-4">
          <IconTile tone="neutral" size="sm"><Clock /></IconTile>
          <h2 className="font-semibold text-ink">Recent sync runs</h2>
        </div>
        <div className="divide-y divide-border-soft">
          {runs.map((run) => (
            <div key={run.id} className="px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {run.status === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-good shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-bad shrink-0" />
                  )}
                  <span className="font-medium text-ink text-sm">{formatTimestamp(run.startedAt)}</span>
                  <span className="text-xs text-ink-faint capitalize">· {run.triggeredBy}</span>
                </div>
                <span className="text-xs text-ink-soft shrink-0">
                  {run.importedCount} imported · {run.duplicateCount} duplicates · {run.failedCount} failed
                </span>
              </div>
              {run.error && <p className="text-xs text-bad mt-1.5">{run.error}</p>}
              {run.failedRows?.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {run.failedRows.slice(0, 5).map((f, i) => (
                    <li key={i} className="text-xs text-ink-faint">Row {f.row}: {f.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {runs.length === 0 && <EmptyState icon={<RefreshCw />} title="No sync runs yet" description="Runs will appear here once the scheduled workflow executes." />}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface-2 px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">{label}</div>
      <div className="text-sm font-semibold text-ink mt-1">{value}</div>
    </div>
  );
}

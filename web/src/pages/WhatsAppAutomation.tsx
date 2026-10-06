import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useWhatsAppAutomations } from "@/hooks/useWhatsAppAutomations";
import {
  createWhatsAppTemplate,
  updateWhatsAppTemplate,
  createWhatsAppAutomation,
  updateWhatsAppAutomation,
  subscribeAllWhatsAppMessages,
  subscribeMyWhatsAppMessages,
  getWhatsAppSettings,
  updateWhatsAppBusinessProfile,
} from "@/lib/data/whatsapp";
import {
  subscribeAllWhatsAppBatches,
  subscribeMyWhatsAppBatches,
  subscribeBatchItems,
  subscribeBatch,
  updateBatchStatus,
  resetFailedItemsToQueued,
} from "@/lib/data/whatsappBatches";
import { useClickToChatQueue } from "@/lib/whatsapp/clickToChatQueue";
import { WhatsAppBatchItemsList } from "@/components/WhatsAppBatchItemsList";
import { unsupportedTemplateTokens, extractTemplateTokens } from "@/lib/whatsapp/templates";
import { getWhatsAppProviderName } from "@/lib/whatsapp/provider";
import { WhatsAppDevBanner } from "@/components/WhatsAppDevBanner";
import { WhatsAppStatusPill } from "@/components/Pills";
import { Button, Card, Field, Input, Select, Textarea, SectionHeading, SegmentedControl, EmptyState, BigStat, Badge, Skeleton } from "@/components/ui";
import { isAdminRole, OPEN_STATUSES, type LeadStatus } from "@/types";
import {
  AUTOMATION_TRIGGER_LABELS,
  WHATSAPP_TEMPLATE_VARIABLES,
  type WhatsAppAutomationDoc,
  type WhatsAppAutomationTrigger,
  type WhatsAppMessageDoc,
  type WhatsAppMessageStatus,
  type WhatsAppTemplateDoc,
  type WhatsAppTemplateCategory,
  type WhatsAppSettingsDoc,
  type WhatsAppBatchDoc,
  type WhatsAppBatchStatus,
  type WhatsAppBatchItemDoc,
} from "@/types/whatsapp";
import { Plus, Pencil, Inbox, MessageSquare, Settings as SettingsIcon, History, ListTodo, Zap, CircleCheck, X, Pause, Play, Square } from "lucide-react";

const TABS = ["Automations", "Templates", "Message Queue", "Message History", "Batches", "Settings"] as const;
type Tab = (typeof TABS)[number];

export function WhatsAppAutomation() {
  const { role, user } = useAuth();
  const canManage = isAdminRole(role);
  const canViewOps = canManage || role === "management";
  const visibleTabs: Tab[] = canViewOps
    ? (canManage ? [...TABS] : TABS.filter((t) => t !== "Settings"))
    : ["Message History", "Batches"];

  const [tab, setTab] = useState<Tab>(visibleTabs[0]);
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];

  return (
    <div className="max-w-6xl mx-auto pb-8">
      <SectionHeading
        eyebrow="Communication"
        title="WhatsApp Automation"
        description="Automated and manual WhatsApp messaging for enquiries — see the Development Mode notice below."
      />
      <WhatsAppDevBanner className="mb-5" />

      {visibleTabs.length > 1 && (
        <div role="tablist" aria-label="WhatsApp Automation views" className="flex flex-wrap gap-1 mb-5 border-b border-border-soft">
          {visibleTabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={activeTab === t}
              onClick={() => setTab(t)}
              className={`relative inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2.5 -mb-px border-b-2 transition-colors ${
                activeTab === t ? "border-accent text-accent" : "border-transparent text-ink-soft hover:text-ink hover:border-ink-faint/30"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {activeTab === "Automations" && <AutomationsTab canManage={canManage} />}
      {activeTab === "Templates" && <TemplatesTab canManage={canManage} />}
      {activeTab === "Message Queue" && <QueueTab />}
      {activeTab === "Message History" && <HistoryTab role={role} uid={user?.uid ?? null} />}
      {activeTab === "Batches" && <BatchesTab role={role} uid={user?.uid ?? null} />}
      {activeTab === "Settings" && canManage && <SettingsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

const EMPTY_AUTOMATION_FORM = {
  name: "",
  trigger: "new_lead_created" as WhatsAppAutomationTrigger,
  fromStatus: "" as LeadStatus | "",
  toStatus: "" as LeadStatus | "",
  templateId: "",
  delayMinutes: 0,
};

function AutomationsTab({ canManage }: { canManage: boolean }) {
  const { user } = useAuth();
  const { automations, loading } = useWhatsAppAutomations();
  const { templates } = useWhatsAppTemplates();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_AUTOMATION_FORM);
  const [saving, setSaving] = useState(false);

  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "(deleted template)";

  const startCreate = () => {
    setForm(EMPTY_AUTOMATION_FORM);
    setEditingId(null);
    setShowForm(true);
  };
  const startEdit = (a: WhatsAppAutomationDoc) => {
    setForm({
      name: a.name,
      trigger: a.trigger,
      fromStatus: a.condition.fromStatus ?? "",
      toStatus: a.condition.toStatus ?? "",
      templateId: a.templateId,
      delayMinutes: a.delayMinutes,
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const save = async () => {
    if (!user || !form.name.trim() || !form.templateId) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        trigger: form.trigger,
        condition: {
          fromStatus: form.trigger === "lead_stage_changed" && form.fromStatus ? form.fromStatus : null,
          toStatus: form.trigger === "lead_stage_changed" && form.toStatus ? form.toStatus : null,
        },
        templateId: form.templateId,
        delayMinutes: Math.max(0, form.delayMinutes),
      };
      if (editingId) await updateWhatsAppAutomation(editingId, payload);
      else await createWhatsAppAutomation(payload, user.uid);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg text-ink">Automation Rules</h2>
        {canManage && (
          <Button size="sm" onClick={startCreate}><Plus className="w-3.5 h-3.5" /> New Automation</Button>
        )}
      </div>

      {showForm && canManage && (
        <Card className="mb-4 border-accent/25 bg-accent-soft/30">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Automation name">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. New Lead Welcome" />
            </Field>
            <Field label="Trigger">
              <Select value={form.trigger} onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value as WhatsAppAutomationTrigger }))}>
                {Object.entries(AUTOMATION_TRIGGER_LABELS)
                  .filter(([key]) => key !== "manual_trigger")
                  .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </Field>
            {form.trigger === "lead_stage_changed" && (
              <>
                <Field label="From status (optional)" hint="Leave blank to match any status.">
                  <Select value={form.fromStatus} onChange={(e) => setForm((f) => ({ ...f, fromStatus: e.target.value as LeadStatus | "" }))}>
                    <option value="">Any</option>
                    {OPEN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
                <Field label="To status (optional)">
                  <Select value={form.toStatus} onChange={(e) => setForm((f) => ({ ...f, toStatus: e.target.value as LeadStatus | "" }))}>
                    <option value="">Any</option>
                    {OPEN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              </>
            )}
            <Field label="Template">
              <Select value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
                <option value="">Select template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Delay (minutes)" hint="0 = immediately.">
              <Input type="number" min="0" value={form.delayMinutes} onChange={(e) => setForm((f) => ({ ...f, delayMinutes: Number(e.target.value) || 0 }))} />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" disabled={saving || !form.name.trim() || !form.templateId} onClick={save}>{editingId ? "Save changes" : "Create automation"}</Button>
            <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-20 rounded-2xl" /></div>
      ) : automations.length === 0 ? (
        <EmptyState icon={<Zap />} title="No automations yet" description={canManage ? "Create one above to start messaging leads automatically." : "An admin hasn't set up any automations yet."} />
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink">{a.name}</span>
                    <Badge tone={a.active ? "good" : "neutral"}>{a.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="text-sm text-ink-soft mt-1">
                    Trigger: <span className="font-medium text-ink">{AUTOMATION_TRIGGER_LABELS[a.trigger]}</span>
                    {a.trigger === "lead_stage_changed" && (a.condition.fromStatus || a.condition.toStatus) && (
                      <> ({a.condition.fromStatus ?? "Any"} → {a.condition.toStatus ?? "Any"})</>
                    )}
                  </div>
                  <div className="text-sm text-ink-soft">Template: <span className="font-medium text-ink">{templateName(a.templateId)}</span></div>
                  <div className="text-xs text-ink-faint mt-1">{a.delayMinutes === 0 ? "Sends immediately" : `Delay: ${a.delayMinutes} min`}</div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => startEdit(a)} aria-label="Edit" title="Edit" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-accent">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => updateWhatsAppAutomation(a.id, { active: !a.active })}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg ${a.active ? "text-bad hover:bg-bad-soft" : "text-good hover:bg-good-soft"}`}
                    >
                      {a.active ? "Disable" : "Enable"}
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATE_CATEGORIES: WhatsAppTemplateCategory[] = ["New Lead", "Visit", "Follow-up", "Admission", "General"];
const EMPTY_TEMPLATE_FORM = { name: "", category: "General" as WhatsAppTemplateCategory, language: "English", content: "" };

function TemplatesTab({ canManage }: { canManage: boolean }) {
  const { user } = useAuth();
  const { templates, loading } = useWhatsAppTemplates();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE_FORM);
  const [saving, setSaving] = useState(false);

  const unsupported = extractTemplateTokens(form.content).length > 0 ? unsupportedTemplateTokens(form.content) : [];

  const startCreate = () => { setForm(EMPTY_TEMPLATE_FORM); setEditingId(null); setShowForm(true); };
  const startEdit = (t: WhatsAppTemplateDoc) => {
    setForm({ name: t.name, category: t.category, language: t.language, content: t.content });
    setEditingId(t.id);
    setShowForm(true);
  };

  const save = async () => {
    if (!user || !form.name.trim() || !form.content.trim() || unsupported.length > 0) return;
    setSaving(true);
    try {
      if (editingId) await updateWhatsAppTemplate(editingId, form);
      else await createWhatsAppTemplate(form, user.uid);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg text-ink">Message Templates</h2>
        {canManage && <Button size="sm" onClick={startCreate}><Plus className="w-3.5 h-3.5" /> New Template</Button>}
      </div>

      {showForm && canManage && (
        <Card className="mb-4 border-accent/25 bg-accent-soft/30">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Template name" hint="">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. New Lead Welcome" />
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as WhatsAppTemplateCategory }))}>
                {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Language">
              <Input value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} />
            </Field>
          </div>
          <Field label="Message content" hint={`Available: ${WHATSAPP_TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(", ")}`}>
            <Textarea rows={6} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Hi {{parent_name}} 👋..." />
          </Field>
          {unsupported.length > 0 && (
            <p className="text-xs text-bad mb-2">Unsupported variable{unsupported.length > 1 ? "s" : ""}: {unsupported.map((v) => `{{${v}}}`).join(", ")}</p>
          )}
          <div className="flex gap-2 mt-2">
            <Button size="sm" disabled={saving || !form.name.trim() || !form.content.trim() || unsupported.length > 0} onClick={save}>{editingId ? "Save changes" : "Create template"}</Button>
            <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
      ) : templates.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title="No templates yet" description={canManage ? "Create one above — automations need a template to send." : "An admin hasn't created any templates yet."} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-semibold text-ink">{t.name}</div>
                  <div className="text-xs text-ink-faint">{t.category} · {t.language}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge tone={t.active ? "good" : "neutral"}>{t.active ? "Active" : "Inactive"}</Badge>
                  {canManage && (
                    <button onClick={() => startEdit(t)} aria-label="Edit" title="Edit" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-accent">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-ink-soft whitespace-pre-wrap line-clamp-4">{t.content}</p>
              {canManage && (
                <button
                  onClick={() => updateWhatsAppTemplate(t.id, { active: !t.active })}
                  className={`text-xs font-semibold mt-2.5 ${t.active ? "text-bad hover:underline" : "text-good hover:underline"}`}
                >
                  {t.active ? "Deactivate" : "Activate"}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Queue + Message History (two views of the same whatsappMessages collection)
// ---------------------------------------------------------------------------

const PENDING_STATUSES: WhatsAppMessageStatus[] = ["DRAFT", "QUEUED", "PROCESSING", "PENDING_PROVIDER"];
const HISTORY_FILTERS = ["All", "Simulated", "Queued", "Failed", "Cancelled", "Sent", "Delivered", "Read"] as const;

function useMessages(scope: "all" | { uid: string }) {
  const [messages, setMessages] = useState<WhatsAppMessageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const scopeKey = scope === "all" ? "all" : scope.uid;
  useEffect(() => {
    const unsub =
      scope === "all"
        ? subscribeAllWhatsAppMessages((items) => { setMessages(items); setLoading(false); })
        : subscribeMyWhatsAppMessages(scope.uid, (items) => { setMessages(items); setLoading(false); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  return { messages, loading };
}

function MessageRow({ m, staffName }: { m: WhatsAppMessageDoc; staffName: (id: string | null) => string }) {
  return (
    <tr className="border-t border-border-soft">
      <td className="px-3 py-2.5 whitespace-nowrap text-ink-soft">{m.createdAt?.toDate().toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) ?? "—"}</td>
      <td className="px-3 py-2.5">
        <Link to={`/leads/${m.leadId}`} className="font-medium text-ink hover:text-accent">{m.leadChildName}</Link>
        <div className="text-xs text-ink-faint">{m.leadParentName}</div>
      </td>
      <td className="px-3 py-2.5 text-ink-soft whitespace-nowrap">{m.toPhone}</td>
      <td className="px-3 py-2.5 text-ink-soft">{m.templateName ?? "—"}</td>
      <td className="px-3 py-2.5 text-ink-soft">{m.trigger === "manual" ? "Manual" : AUTOMATION_TRIGGER_LABELS[m.trigger]}</td>
      <td className="px-3 py-2.5"><WhatsAppStatusPill status={m.status} /></td>
      <td className="px-3 py-2.5"><Badge tone={m.origin === "automated" ? "accent" : "neutral"}>{m.origin === "automated" ? "Automated" : "Manual"}</Badge></td>
      <td className="px-3 py-2.5 text-ink-faint whitespace-nowrap">Development Provider</td>
      <td className="px-3 py-2.5 text-ink-soft whitespace-nowrap">{m.createdByStaffId ? staffName(m.createdByStaffId) : "System"}</td>
      <td className="px-3 py-2.5 text-bad max-w-[180px] truncate" title={m.error ?? ""}>{m.error ?? "—"}</td>
    </tr>
  );
}

function MessagesTable({ messages, staffName }: { messages: WhatsAppMessageDoc[]; staffName: (id: string | null) => string }) {
  if (messages.length === 0) return <EmptyState icon={<Inbox />} title="Nothing here yet" />;
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-ink-faint text-[11px] uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2.5">Date/Time</th>
            <th className="text-left px-3 py-2.5">Lead</th>
            <th className="text-left px-3 py-2.5">Mobile</th>
            <th className="text-left px-3 py-2.5">Template</th>
            <th className="text-left px-3 py-2.5">Trigger</th>
            <th className="text-left px-3 py-2.5">Status</th>
            <th className="text-left px-3 py-2.5">Origin</th>
            <th className="text-left px-3 py-2.5">Provider</th>
            <th className="text-left px-3 py-2.5">Created By</th>
            <th className="text-left px-3 py-2.5">Error</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => <MessageRow key={m.id} m={m} staffName={staffName} />)}
        </tbody>
      </table>
    </div>
  );
}

function QueueTab() {
  const { messages, loading } = useMessages("all");
  const { staffName } = useLookups();
  const pending = useMemo(() => messages.filter((m) => PENDING_STATUSES.includes(m.status)), [messages]);

  return (
    <div>
      <h2 className="font-semibold text-lg text-ink mb-4">Message Queue</h2>
      <p className="text-sm text-ink-faint mb-4">
        Messages waiting to be processed — most are picked up instantly by the Development provider, so this is usually only
        non-empty for scheduled messages waiting for their send time.
      </p>
      {loading ? <Skeleton className="h-40 rounded-2xl" /> : <MessagesTable messages={pending} staffName={staffName} />}
    </div>
  );
}

function HistoryTab({ role, uid }: { role: string | null; uid: string | null }) {
  const { staffName } = useLookups();
  const scope = role === "counsellor" && uid ? ({ uid } as const) : "all";
  const { messages, loading } = useMessages(scope);
  const [filter, setFilter] = useState<(typeof HISTORY_FILTERS)[number]>("All");

  const filtered = useMemo(() => {
    if (filter === "All") return messages;
    const map: Record<string, WhatsAppMessageStatus> = {
      Simulated: "SIMULATED", Queued: "QUEUED", Failed: "FAILED", Cancelled: "CANCELLED",
      Sent: "SENT", Delivered: "DELIVERED", Read: "READ",
    };
    return messages.filter((m) => m.status === map[filter]);
  }, [messages, filter]);

  const stats = useMemo(() => ({
    total: messages.length,
    simulated: messages.filter((m) => m.status === "SIMULATED").length,
    queued: messages.filter((m) => PENDING_STATUSES.includes(m.status)).length,
    failed: messages.filter((m) => m.status === "FAILED" || m.status === "CANCELLED").length,
  }), [messages]);

  return (
    <div>
      <h2 className="font-semibold text-lg text-ink mb-4">Message History &amp; Automation Logs</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <BigStat value={stats.total} label="Total Messages" icon={<History />} />
        <BigStat value={stats.simulated} label="Simulated" icon={<CircleCheck />} color="var(--color-warn)" />
        <BigStat value={stats.queued} label="Queued / Pending" icon={<ListTodo />} />
        <BigStat value={stats.failed} label="Failed / Cancelled" icon={<Inbox />} color="var(--color-bad)" />
      </div>
      <SegmentedControl
        className="mb-4"
        options={HISTORY_FILTERS.map((f) => ({ value: f, label: f }))}
        value={filter}
        onChange={setFilter}
      />
      {loading ? <Skeleton className="h-40 rounded-2xl" /> : <MessagesTable messages={filtered} staffName={staffName} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batches (Click-to-Chat batch history, details, and retry — Sections 16-18)
// ---------------------------------------------------------------------------

const BATCH_STATUS_TONE: Record<WhatsAppBatchStatus, "accent" | "good" | "warn" | "bad" | "neutral"> = {
  running: "warn",
  paused: "warn",
  completed: "good",
  cancelled: "neutral",
};

function useBatches(scope: "all" | { uid: string }) {
  const [batches, setBatches] = useState<WhatsAppBatchDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const scopeKey = scope === "all" ? "all" : scope.uid;
  useEffect(() => {
    const unsub =
      scope === "all"
        ? subscribeAllWhatsAppBatches((items) => { setBatches(items); setLoading(false); })
        : subscribeMyWhatsAppBatches(scope.uid, (items) => { setBatches(items); setLoading(false); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  return { batches, loading };
}

function BatchesTab({ role, uid }: { role: string | null; uid: string | null }) {
  const { staffName } = useLookups();
  const scope = role === "counsellor" && uid ? ({ uid } as const) : "all";
  const { batches, loading } = useBatches(scope);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  return (
    <div>
      <h2 className="font-semibold text-lg text-ink mb-4">WhatsApp Batch History</h2>
      <p className="text-sm text-ink-faint mb-4">
        Every Click-to-Chat batch sent from the Leads page, with per-lead results. "Opened" means the chat was prepared — it still
        needs a manual "Mark as Sent" confirmation below once you've actually pressed Send in WhatsApp.
      </p>
      {loading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : batches.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No batches yet" description="Send a WhatsApp batch from the Leads page to see it here." />
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-faint text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Created By</th>
                <th className="text-left px-3 py-2.5">Total</th>
                <th className="text-left px-3 py-2.5">Opened</th>
                <th className="text-left px-3 py-2.5">Manually Sent</th>
                <th className="text-left px-3 py-2.5">Failed</th>
                <th className="text-left px-3 py-2.5">Skipped</th>
                <th className="text-left px-3 py-2.5">Attachment</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-border-soft">
                  <td className="px-3 py-2.5 whitespace-nowrap text-ink-soft">
                    {b.createdAt?.toDate().toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft whitespace-nowrap">{staffName(b.createdByStaffId)}</td>
                  <td className="px-3 py-2.5">{b.totalCount}</td>
                  <td className="px-3 py-2.5 text-warn">{b.openedCount}</td>
                  <td className="px-3 py-2.5 text-good">{b.manuallySentCount}</td>
                  <td className="px-3 py-2.5 text-bad">{b.failedCount}</td>
                  <td className="px-3 py-2.5 text-ink-faint">{b.skippedCount}</td>
                  <td className="px-3 py-2.5 text-ink-soft truncate max-w-[140px]">{b.attachmentName ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={BATCH_STATUS_TONE[b.status]}>{b.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <button type="button" className="text-accent text-xs font-semibold hover:underline" onClick={() => setSelectedBatchId(b.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedBatchId && <BatchDetailsModal batchId={selectedBatchId} onClose={() => setSelectedBatchId(null)} />}
    </div>
  );
}

function BatchDetailsModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const [batch, setBatch] = useState<WhatsAppBatchDoc | null>(null);
  const [items, setItems] = useState<WhatsAppBatchItemDoc[]>([]);
  const queue = useClickToChatQueue(batch?.delaySeconds ?? 15);

  useEffect(() => subscribeBatchItems(batchId, setItems), [batchId]);
  useEffect(() => subscribeBatch(batchId, setBatch), [batchId]);

  const failedItems = items.filter((i) => i.status === "FAILED");

  const handleRetryFailed = async () => {
    const reset = await resetFailedItemsToQueued(batchId);
    if (reset.length === 0) return;
    const queueItems = reset.map((i) => ({ itemId: i.id, mobile: i.mobile, renderedMessage: i.renderedMessage }));
    const { stopped } = await queue.start(batchId, queueItems);
    if (!stopped) await updateBatchStatus(batchId, "completed", { completed: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={queue.running ? undefined : onClose}>
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <h2 className="font-semibold text-ink">Batch Details</h2>
          {!queue.running && (
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {queue.running && (
            <div className="rounded-xl border border-border-soft bg-surface-2 p-4 text-center space-y-2">
              <div className="text-sm font-semibold text-ink">Retrying failed messages…</div>
              {queue.currentItemId && (
                <div className="text-xs text-ink-soft">
                  {queue.paused ? "Paused" : queue.countdown > 0 ? `Next chat in ${queue.countdown}s…` : "Opening WhatsApp…"}
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                {!queue.paused ? (
                  <Button size="sm" variant="secondary" onClick={queue.pause}>
                    <Pause className="w-4 h-4" /> Pause
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={queue.resume}>
                    <Play className="w-4 h-4" /> Resume
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={queue.stop}>
                  <Square className="w-4 h-4" /> Stop
                </Button>
              </div>
            </div>
          )}
          {items.length === 0 ? <Skeleton className="h-32 rounded-xl" /> : <WhatsAppBatchItemsList batchId={batchId} items={items} currentItemId={queue.currentItemId} />}
        </div>
        <div className="flex items-center gap-2 px-5 py-4 border-t border-border-soft">
          {failedItems.length > 0 && !queue.running && (
            <Button variant="secondary" onClick={handleRetryFailed}>
              Retry Failed ({failedItems.length})
            </Button>
          )}
          <Button className="flex-1" disabled={queue.running} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsTab() {
  const [settings, setSettings] = useState<WhatsAppSettingsDoc | null>(null);
  const [form, setForm] = useState({ schoolName: "", schoolPhone: "", schoolAddress: "" });
  const [saving, setSaving] = useState(false);
  const providerName = getWhatsAppProviderName();

  useEffect(() => {
    getWhatsAppSettings().then((s) => {
      setSettings(s);
      setForm({ schoolName: s.schoolName, schoolPhone: s.schoolPhone, schoolAddress: s.schoolAddress });
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateWhatsAppBusinessProfile(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <SettingsIcon className="w-4 h-4 text-ink-faint" />
          <h2 className="font-semibold text-ink">Integration Status</h2>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Badge tone="warn">Development Mode</Badge>
          <span className="text-sm text-ink-soft">WhatsApp API: <strong className="text-ink">Not Connected</strong></span>
        </div>
        <p className="text-xs text-ink-faint mt-2">
          Active provider: <code className="font-mono">{providerName}</code> (set via the VITE_WHATSAPP_PROVIDER build config —
          never a runtime UI setting, so a provider can't be switched without a deliberate deploy).
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold text-ink mb-1">Business Profile</h2>
        <p className="text-xs text-ink-faint mb-4">Used to fill {"{{school_name}}"}, {"{{school_phone}}"} and {"{{school_address}}"} in templates.</p>
        {!settings ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          <>
            <Field label="School name">
              <Input value={form.schoolName} onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))} />
            </Field>
            <Field label="School phone">
              <Input value={form.schoolPhone} onChange={(e) => setForm((f) => ({ ...f, schoolPhone: e.target.value }))} placeholder="+91 99442 60036" />
            </Field>
            <Field label="School address">
              <Textarea rows={2} value={form.schoolAddress} onChange={(e) => setForm((f) => ({ ...f, schoolAddress: e.target.value }))} />
            </Field>
            <Button size="sm" disabled={saving} onClick={save}>Save</Button>
          </>
        )}
      </Card>

      <Card className="opacity-70">
        <h2 className="font-semibold text-ink mb-1">Future Provider Configuration</h2>
        <p className="text-xs text-ink-faint mb-4">
          Available once a WhatsApp Business API provider (e.g. Meta WhatsApp Cloud API) is connected. Disabled intentionally —
          credentials are never entered or stored here; they'll live in a server-side secret, not Firestore or the browser.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Provider"><Input disabled placeholder="Not configured" /></Field>
          <Field label="Phone Number ID"><Input disabled placeholder="Not configured" /></Field>
          <Field label="Business Account ID"><Input disabled placeholder="Not configured" /></Field>
          <Field label="Access Token"><Input disabled placeholder="Not configured" type="password" /></Field>
        </div>
      </Card>
    </div>
  );
}

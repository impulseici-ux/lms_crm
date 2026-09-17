import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { FilterBar, EMPTY_FILTERS, applyFilters } from "@/components/FilterBar";
import { StatusPill, PriorityPill, FollowUpPill } from "@/components/Pills";
import { computeAttentionFlags } from "@/utils/attention";
import { deriveFollowUpState } from "@/utils/followUp";
import { downloadCsv } from "@/utils/csv";
import { buildWhatsAppLink } from "@/utils/whatsapp";
import { breakdownBySource, breakdownByStaff } from "@/utils/metrics";
import { bulkChangeStatus, bulkReassign, deleteLead } from "@/lib/data/leads";
import { ImportLeadsModal } from "@/components/ImportLeadsModal";
import { Button, EmptyState, SectionHeading, SegmentedControl, Skeleton, Select, ProgressBar } from "@/components/ui";
import { OPEN_STATUSES, CLOSED_STATUSES, type LeadDoc, type LeadStatus } from "@/types";
import {
  UserPlus,
  Download,
  Upload,
  Inbox,
  Phone,
  Search,
  Eye,
  Pencil,
  Trash2,
  MessageCircle,
  Table2,
  BarChart3,
  PieChart,
  CalendarClock,
  X,
  ChevronDown,
} from "lucide-react";

const QUICK_VIEWS = ["All", "My Leads", "Follow-up Today", "Overdue", "Visits", "Converted", "Needs Attention"] as const;
type QuickView = (typeof QUICK_VIEWS)[number];

const TABS = [
  { key: "Data table", icon: Table2 },
  { key: "Stats", icon: BarChart3 },
  { key: "Analytics", icon: PieChart },
  { key: "Followups", icon: CalendarClock },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function matchesQuickView(view: QuickView, lead: LeadDoc, uid: string | undefined): boolean {
  if (view === "My Leads") return !!uid && lead.assignedStaffId === uid;
  if (view === "Follow-up Today") return deriveFollowUpState(lead.nextFollowUpAt) === "Due Today";
  if (view === "Overdue") return deriveFollowUpState(lead.nextFollowUpAt) === "Overdue";
  if (view === "Visits") return ["Visit Scheduled", "Visit Completed"].includes(lead.status);
  if (view === "Converted") return lead.status === "Admission Confirmed";
  return true;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

interface ColumnFilters {
  name: string;
  course: string;
  source: string;
  mobile: string;
  location: string;
  remarks: string;
  admin: string;
}
const EMPTY_COLUMN_FILTERS: ColumnFilters = { name: "", course: "", source: "", mobile: "", location: "", remarks: "", admin: "" };

export function Leads() {
  const { user, role } = useAuth();
  const { leads, loading } = useLeads();
  const { programName, staffName, branches, programs, leadSources, campaigns, users } = useLookups();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [tab, setTab] = useState<TabKey>("Data table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("Contacted");
  const [bulkStaffId, setBulkStaffId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const viewParam = searchParams.get("view");
  const initialView = viewParam === "attention" ? "Needs Attention" : QUICK_VIEWS.includes(viewParam as QuickView) ? (viewParam as QuickView) : "All";
  const [quickView, setQuickView] = useState<QuickView>(initialView);

  const filtered = useMemo(() => applyFilters(leads, filters), [leads, filters]);
  const attentionLeadIds = useMemo(() => new Set(computeAttentionFlags(filtered).map((f) => f.lead.id)), [filtered]);
  const quickViewFiltered = useMemo(() => {
    const base = filtered.filter((lead) => matchesQuickView(quickView, lead, user?.uid));
    return quickView === "Needs Attention" ? base.filter((l) => attentionLeadIds.has(l.id)) : base;
  }, [filtered, quickView, user?.uid, attentionLeadIds]);

  const visible = useMemo(() => {
    const cf = columnFilters;
    if (!Object.values(cf).some(Boolean)) return quickViewFiltered;
    return quickViewFiltered.filter((l) => {
      if (cf.name && !`${l.parentName} ${l.childName}`.toLowerCase().includes(cf.name.toLowerCase())) return false;
      if (cf.course && !programName(l.interestedProgramId).toLowerCase().includes(cf.course.toLowerCase())) return false;
      if (cf.source && !l.sourceChannel.toLowerCase().includes(cf.source.toLowerCase())) return false;
      if (cf.mobile && !l.parentPhone.includes(cf.mobile)) return false;
      if (cf.location && !(l.location ?? "").toLowerCase().includes(cf.location.toLowerCase())) return false;
      if (cf.remarks && !(l.notes ?? "").toLowerCase().includes(cf.remarks.toLowerCase())) return false;
      if (cf.admin && !staffName(l.assignedStaffId).toLowerCase().includes(cf.admin.toLowerCase())) return false;
      return true;
    });
  }, [quickViewFiltered, columnFilters, programName, staffName]);

  const selectedLeads = useMemo(() => visible.filter((l) => selected.has(l.id)), [visible, selected]);
  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.id));

  const toggleAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((l) => l.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chooseView = (view: QuickView) => {
    setQuickView(view);
    setSelected(new Set());
    if (view === "Needs Attention") setSearchParams({ view: "attention" });
    else setSearchParams(view === "All" ? {} : { view });
  };

  const exportCsv = () =>
    downloadCsv(
      "leads.csv",
      visible.map((l) => ({
        parentName: l.parentName,
        parentPhone: l.parentPhone,
        childName: l.childName,
        course: programName(l.interestedProgramId),
        fees: l.fees ?? "",
        status: l.status,
        source: l.sourceChannel,
        priority: l.priority,
        location: l.location ?? "",
        remarks: l.notes ?? "",
        assignedStaff: staffName(l.assignedStaffId),
        nextFollowUpAt: l.nextFollowUpAt?.toDate().toISOString() ?? "",
        createdAt: l.createdAt?.toDate().toISOString() ?? "",
      }))
    );

  const runBulkStatus = async () => {
    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const result = await bulkChangeStatus(selectedLeads, bulkStatus, user!.uid);
      setBulkMessage(
        result.skipped.length === 0
          ? `Updated ${result.updatedCount} lead${result.updatedCount === 1 ? "" : "s"}.`
          : `Updated ${result.updatedCount}. Skipped ${result.skipped.length}: ${result.skipped.map((s) => s.reason).join(", ")}`
      );
      setSelected(new Set());
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : "Bulk update failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkReassign = async () => {
    if (!bulkStaffId) return;
    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const result = await bulkReassign(selectedLeads, bulkStaffId, null, user!.uid);
      setBulkMessage(
        result.skipped.length === 0
          ? `Reassigned ${result.updatedCount} lead${result.updatedCount === 1 ? "" : "s"}.`
          : `Reassigned ${result.updatedCount}. Skipped ${result.skipped.length}: ${result.skipped.map((s) => s.reason).join(", ")}`
      );
      setSelected(new Set());
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : "Bulk reassignment failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const onDeleteRow = async (lead: LeadDoc) => {
    if (!window.confirm(`Delete the lead for ${lead.parentName} · ${lead.childName}? This cannot be undone.`)) return;
    await deleteLead(lead.id);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <Skeleton className="h-9 w-40 mb-2" />
        <Skeleton className="h-4 w-72 mb-6" />
        <Skeleton className="h-32 rounded-2xl mb-5" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const segments = QUICK_VIEWS.map((view) => ({
    value: view,
    label: view,
    count: view === "Needs Attention" ? attentionLeadIds.size : filtered.filter((l) => matchesQuickView(view, l, user?.uid)).length,
    tone: view === "Needs Attention" ? ("bad" as const) : ("accent" as const),
  }));

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <SectionHeading eyebrow="Admissions pipeline" title="Enquiries" description="Manage and track all your student enquiries in one place." />

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 text-[13px] font-semibold px-3.5 py-2 rounded-xl border transition-colors ${
                active ? "bg-accent text-white border-accent" : "bg-surface text-ink-soft border-border hover:border-ink-faint/40 hover:text-ink"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.key}
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>
          );
        })}
      </div>

      <FilterBar filters={filters} onApply={setFilters} />

      {tab === "Data table" && (
        <>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold text-lg text-ink">All Enquiries</h2>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <div className="relative">
                <Button variant="secondary" size="sm" onClick={() => setShowWhatsApp((v) => !v)} disabled={selected.size === 0} className="!bg-good/10 !text-good !border-good/20 hover:!bg-good/15">
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </Button>
                {showWhatsApp && selected.size > 0 && (
                  <div className="absolute right-0 mt-1 z-20 w-64 bg-surface border border-border rounded-xl shadow-elevated p-2 max-h-64 overflow-y-auto">
                    {selectedLeads.map((l) => (
                      <a
                        key={l.id}
                        href={buildWhatsAppLink(l.parentPhone, l.parentName, l.sourceChannel)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowWhatsApp(false)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-surface-2"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-good shrink-0" />
                        <span className="truncate">{l.parentName} · {l.childName}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={exportCsv}><Download className="w-3.5 h-3.5" /> Export</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}><Upload className="w-3.5 h-3.5" /> Upload</Button>
              {(Object.values(filters).some(Boolean) || Object.values(columnFilters).some(Boolean)) && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setFilters(EMPTY_FILTERS);
                    setColumnFilters(EMPTY_COLUMN_FILTERS);
                  }}
                >
                  <X className="w-3.5 h-3.5" /> Clear Filters
                </Button>
              )}
              <Link to="/leads/new">
                <Button size="sm"><UserPlus className="w-3.5 h-3.5" /> Add Enquiry</Button>
              </Link>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 bg-accent-soft border border-accent/20 rounded-xl px-4 py-3 mb-3">
              <span className="text-sm font-semibold text-accent-strong shrink-0">{selected.size} selected</span>
              <div className="flex items-center gap-1.5">
                <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as LeadStatus)} className="py-1.5 text-[13px] w-44">
                  <optgroup label="Open">{OPEN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
                  <optgroup label="Closed">{CLOSED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
                </Select>
                <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={runBulkStatus}>Update Status</Button>
              </div>
              {role === "admin" && (
                <div className="flex items-center gap-1.5">
                  <Select value={bulkStaffId} onChange={(e) => setBulkStaffId(e.target.value)} className="py-1.5 text-[13px] w-44">
                    <option value="">Reassign to…</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                  </Select>
                  <Button size="sm" variant="secondary" disabled={bulkBusy || !bulkStaffId} onClick={runBulkReassign}>Reassign</Button>
                </div>
              )}
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs font-semibold text-accent-strong hover:underline">
                Clear selection
              </button>
            </div>
          )}
          {bulkMessage && <div className="text-xs text-ink-soft mb-3 px-1">{bulkMessage}</div>}

          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-ink-faint text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="rounded border-border" aria-label="Select all" />
                    </th>
                    <th className="text-left px-2 py-3">Name</th>
                    <th className="text-left px-2 py-3">Course</th>
                    <th className="text-left px-2 py-3">Fees</th>
                    <th className="text-left px-2 py-3">Status</th>
                    <th className="text-left px-2 py-3">Source</th>
                    <th className="text-left px-2 py-3">Priority</th>
                    <th className="text-left px-2 py-3">Mobile</th>
                    <th className="text-left px-2 py-3">Follow-up</th>
                    <th className="text-left px-2 py-3">Location</th>
                    <th className="text-left px-2 py-3">Remarks</th>
                    <th className="text-left px-2 py-3">Admin</th>
                    <th className="text-left px-2 py-3">Actions</th>
                  </tr>
                  <tr className="bg-surface">
                    <td className="px-4 py-1.5" />
                    <ColumnSearchCell value={columnFilters.name} onChange={(v) => setColumnFilters((c) => ({ ...c, name: v }))} />
                    <ColumnSearchCell value={columnFilters.course} onChange={(v) => setColumnFilters((c) => ({ ...c, course: v }))} />
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5" />
                    <ColumnSearchCell value={columnFilters.source} onChange={(v) => setColumnFilters((c) => ({ ...c, source: v }))} />
                    <td className="px-2 py-1.5" />
                    <ColumnSearchCell value={columnFilters.mobile} onChange={(v) => setColumnFilters((c) => ({ ...c, mobile: v }))} />
                    <td className="px-2 py-1.5" />
                    <ColumnSearchCell value={columnFilters.location} onChange={(v) => setColumnFilters((c) => ({ ...c, location: v }))} />
                    <ColumnSearchCell value={columnFilters.remarks} onChange={(v) => setColumnFilters((c) => ({ ...c, remarks: v }))} />
                    <ColumnSearchCell value={columnFilters.admin} onChange={(v) => setColumnFilters((c) => ({ ...c, admin: v }))} />
                    <td className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((lead) => (
                    <tr key={lead.id} className={`border-t border-border-soft transition-colors ${selected.has(lead.id) ? "bg-accent-soft/40" : "hover:bg-surface-2/50"}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)} className="rounded border-border" aria-label={`Select ${lead.parentName}`} />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center text-[11px] font-bold shrink-0">
                            {initials(lead.parentName)}
                          </div>
                          <div className="min-w-0">
                            <Link to={`/leads/${lead.id}`} className="font-semibold text-ink hover:text-accent">{lead.parentName}</Link>
                            <div className="text-ink-faint text-xs mt-0.5 truncate">{lead.childName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-ink-soft whitespace-nowrap">{programName(lead.interestedProgramId)}</td>
                      <td className="px-2 py-3 text-ink-soft whitespace-nowrap">{lead.fees != null ? `₹${lead.fees.toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-2 py-3"><StatusPill status={lead.status} /></td>
                      <td className="px-2 py-3 text-ink-soft whitespace-nowrap">{lead.sourceChannel}</td>
                      <td className="px-2 py-3"><PriorityPill priority={lead.priority} /></td>
                      <td className="px-2 py-3 text-ink-soft whitespace-nowrap"><span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{lead.parentPhone}</span></td>
                      <td className="px-2 py-3"><FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} /></td>
                      <td className="px-2 py-3 text-ink-soft whitespace-nowrap">{lead.location ?? "—"}</td>
                      <td className="px-2 py-3 text-ink-faint max-w-[140px] truncate" title={lead.notes ?? ""}>{lead.notes ?? "—"}</td>
                      <td className="px-2 py-3 text-ink-soft whitespace-nowrap">{staffName(lead.assignedStaffId)}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-1">
                          <Link to={`/leads/${lead.id}`} aria-label="View" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-accent">
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link to={`/leads/${lead.id}`} aria-label="Edit" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-accent">
                            <Pencil className="w-4 h-4" />
                          </Link>
                          {role === "admin" && (
                            <button onClick={() => onDeleteRow(lead)} aria-label="Delete" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-bad-soft hover:text-bad">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-border-soft">
              {visible.map((lead) => (
                <div key={lead.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)} className="mt-1 rounded border-border shrink-0" aria-label={`Select ${lead.parentName}`} />
                    <Link to={`/leads/${lead.id}`} className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-ink truncate">{lead.parentName}</div>
                          <div className="text-xs text-ink-soft mt-0.5 truncate">{lead.childName} · {lead.parentPhone}</div>
                        </div>
                        <StatusPill status={lead.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <PriorityPill priority={lead.priority} />
                        <FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} />
                        <span className="text-xs text-ink-soft">{programName(lead.interestedProgramId)}</span>
                      </div>
                      <div className="text-xs text-ink-faint mt-2">{lead.sourceChannel} · {staffName(lead.assignedStaffId)}{lead.fees != null ? ` · ₹${lead.fees.toLocaleString("en-IN")}` : ""}</div>
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {visible.length === 0 && (
              <EmptyState
                icon={<Inbox />}
                title="No leads found"
                description="Try clearing a filter, changing your search, or switching views."
                action={
                  <button
                    type="button"
                    onClick={() => { setFilters(EMPTY_FILTERS); setColumnFilters(EMPTY_COLUMN_FILTERS); chooseView("All"); }}
                    className="text-xs font-semibold text-accent hover:text-accent-strong"
                  >
                    Clear filters →
                  </button>
                }
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mt-3">
            <SegmentedControl options={segments} value={quickView} onChange={chooseView} />
            <div className="text-xs text-ink-faint shrink-0">
              Showing <span className="font-semibold text-ink-soft">{visible.length}</span> of {leads.length}
            </div>
          </div>
        </>
      )}

      {tab === "Stats" && <StatsTab leads={visible} />}
      {tab === "Analytics" && <AnalyticsTab leads={visible} staffName={staffName} />}
      {tab === "Followups" && <FollowupsTab leads={visible} programName={programName} />}

      {showImport && (
        <ImportLeadsModal
          onClose={() => setShowImport(false)}
          existingLeads={leads}
          programs={programs}
          leadSources={leadSources}
          branches={branches}
          campaigns={campaigns}
          users={users}
          currentUserId={user!.uid}
        />
      )}
    </div>
  );
}

function ColumnSearchCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <td className="px-2 py-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-faint pointer-events-none" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border-soft bg-surface pl-6 pr-2 py-1 text-[11px] text-ink-soft placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/30"
          placeholder="Search…"
        />
      </div>
    </td>
  );
}

function StatsTab({ leads }: { leads: LeadDoc[] }) {
  const total = leads.length;
  const open = leads.filter((l) => !CLOSED_STATUSES.includes(l.status as (typeof CLOSED_STATUSES)[number])).length;
  const closed = total - open;
  const overdue = leads.filter((l) => deriveFollowUpState(l.nextFollowUpAt) === "Overdue").length;
  const admitted = leads.filter((l) => l.status === "Admission Confirmed").length;
  const totalFees = leads.reduce((sum, l) => sum + (l.fees ?? 0), 0);
  const stats = [
    { label: "Total enquiries", value: total },
    { label: "Open", value: open },
    { label: "Closed", value: closed },
    { label: "Overdue follow-ups", value: overdue, tone: "text-bad" },
    { label: "Admissions", value: admitted, tone: "text-good" },
    { label: "Total fees quoted", value: `₹${totalFees.toLocaleString("en-IN")}` },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface border border-border rounded-2xl p-5">
          <div className={`font-display text-2xl font-semibold ${s.tone ?? ""}`}>{s.value}</div>
          <div className="text-sm text-ink-soft mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ leads, staffName }: { leads: LeadDoc[]; staffName: (id: string | null) => string }) {
  const bySource = breakdownBySource(leads);
  const byStaff = breakdownByStaff(leads);
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-ink mb-4">By source</h3>
        <div className="space-y-3">
          {bySource.map((row) => (
            <div key={row.key}>
              <div className="flex justify-between text-sm mb-1"><span className="font-medium">{row.key}</span><span className="text-ink-faint">{row.total}</span></div>
              <ProgressBar value={bySource[0].total ? (row.total / bySource[0].total) * 100 : 0} />
            </div>
          ))}
          {bySource.length === 0 && <p className="text-sm text-ink-faint">No data.</p>}
        </div>
      </div>
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-ink mb-4">By staff</h3>
        <div className="space-y-3">
          {byStaff.map((row) => (
            <div key={row.key}>
              <div className="flex justify-between text-sm mb-1"><span className="font-medium">{staffName(row.key === "—" ? null : row.key)}</span><span className="text-ink-faint">{row.total}</span></div>
              <ProgressBar value={byStaff[0].total ? (row.total / byStaff[0].total) * 100 : 0} tone="good" />
            </div>
          ))}
          {byStaff.length === 0 && <p className="text-sm text-ink-faint">No data.</p>}
        </div>
      </div>
    </div>
  );
}

function FollowupsTab({ leads, programName }: { leads: LeadDoc[]; programName: (id: string | null) => string }) {
  const groups = { Overdue: [] as LeadDoc[], "Due Today": [] as LeadDoc[], Upcoming: [] as LeadDoc[] };
  for (const l of leads) {
    const state = deriveFollowUpState(l.nextFollowUpAt);
    if (state === "Overdue" || state === "Due Today" || state === "Upcoming") groups[state].push(l);
  }
  return (
    <div className="space-y-6">
      {(["Overdue", "Due Today", "Upcoming"] as const).map((key) => (
        <div key={key} className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between">
            <h3 className={`font-semibold ${key === "Overdue" ? "text-bad" : key === "Due Today" ? "text-warn" : "text-ink"}`}>{key}</h3>
            <span className="text-xs text-ink-faint">{groups[key].length}</span>
          </div>
          <div className="divide-y divide-border-soft">
            {groups[key].map((l) => (
              <Link key={l.id} to={`/leads/${l.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-2 transition-colors">
                <div className="min-w-0"><div className="font-semibold text-sm">{l.parentName} · {l.childName}</div><div className="text-xs text-ink-faint">{programName(l.interestedProgramId)}</div></div>
                <div className="text-xs text-ink-soft shrink-0">{l.nextFollowUpAt?.toDate().toLocaleString() ?? "—"}</div>
              </Link>
            ))}
            {groups[key].length === 0 && <div className="px-5 py-6 text-center text-sm text-ink-faint">Nothing here.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

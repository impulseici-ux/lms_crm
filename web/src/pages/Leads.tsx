import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useLeads } from "@/hooks/useLeads";
import { useLookups } from "@/hooks/useLookups";
import { FilterBar, EMPTY_FILTERS, applyFilters } from "@/components/FilterBar";
import { StatusPill, PriorityPill, FollowUpPill } from "@/components/Pills";
import { LeadDrawer } from "@/components/LeadDrawer";
import { computeAttentionFlags } from "@/utils/attention";
import { deriveFollowUpState, isFollowUpDueToday, isFollowUpOverdue } from "@/utils/followUp";
import { downloadCsv } from "@/utils/csv";
import { buildWhatsAppLink } from "@/utils/whatsapp";
import { isValidLeadPhone } from "@/utils/phone";
import { isLeadUnseen } from "@/utils/leadViewed";
import { breakdownBySource, breakdownByStaff } from "@/utils/metrics";
import { bulkChangeStatus, bulkReassign, deleteLead } from "@/lib/data/leads";
import { ImportLeadsModal } from "@/components/ImportLeadsModal";
import { BulkSendWhatsAppModal } from "@/components/BulkSendWhatsAppModal";
import { Button, EmptyState, SectionHeading, SegmentedControl, Skeleton, Select, ProgressBar, Badge } from "@/components/ui";
import { OPEN_STATUSES, CLOSED_STATUSES, isAdminRole, canExportData, isOpenStatus, isClosedStatus, type LeadDoc, type LeadStatus } from "@/types";
import {
  UserPlus,
  Download,
  Upload,
  Inbox,
  Phone,
  Search,
  Eye,
  Trash2,
  MessageCircle,
  Send,
  Table2,
  BarChart3,
  PieChart,
  CalendarClock,
  X,
  ShieldAlert,
  Columns3,
  MoreHorizontal,
  Plus,
  LayoutGrid,
  CheckSquare,
} from "lucide-react";

const QUICK_VIEWS = ["All", "My Leads", "Follow-up Today", "Overdue", "Visits", "Converted", "Closed", "Needs Attention"] as const;
type QuickView = (typeof QUICK_VIEWS)[number];

const TOGGLEABLE_COLUMNS = ["course", "fees", "source", "location", "remarks", "admin"] as const;
type ToggleableColumn = (typeof TOGGLEABLE_COLUMNS)[number];
const COLUMN_LABELS: Record<ToggleableColumn, string> = {
  course: "Course",
  fees: "Fees",
  source: "Source",
  location: "Location",
  remarks: "Remarks",
  admin: "Admin",
};
const DEFAULT_VISIBLE_COLUMNS: Record<ToggleableColumn, boolean> = {
  course: true,
  fees: true,
  source: true,
  location: true,
  remarks: true,
  admin: true,
};
const COLUMN_PREFS_KEY = "lms-crm:leads-table-columns";

function loadColumnPrefs(): Record<ToggleableColumn, boolean> {
  try {
    const raw = localStorage.getItem(COLUMN_PREFS_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    return { ...DEFAULT_VISIBLE_COLUMNS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

const TABS = [
  { key: "Data table", icon: Table2 },
  { key: "Stats", icon: BarChart3 },
  { key: "Analytics", icon: PieChart },
  { key: "Followups", icon: CalendarClock },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function matchesQuickView(view: QuickView, lead: LeadDoc, uid: string | undefined): boolean {
  if (view === "My Leads") return !!uid && lead.assignedStaffId === uid;
  if (view === "Follow-up Today") return isFollowUpDueToday(lead);
  if (view === "Overdue") return isFollowUpOverdue(lead);
  if (view === "Visits") return ["Visit Scheduled", "Visit Completed"].includes(lead.status);
  if (view === "Converted") return lead.status === "Admission Confirmed";
  if (view === "Closed") return isClosedStatus(lead.status);
  return true;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const MOBILE_PAGE_SIZE = 30;

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
  const { programName, staffName, branchName, branches, programs, leadSources, campaigns, users } = useLookups();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const staffIdParam = searchParams.get("staffId");
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    status: statusParam && (isOpenStatus(statusParam) || isClosedStatus(statusParam)) ? statusParam : "",
    staffId: staffIdParam ?? "",
  }));
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [tab, setTab] = useState<TabKey>("Data table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showBulkSend, setShowBulkSend] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("Contacted");
  const [bulkStaffId, setBulkStaffId] = useState("");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ToggleableColumn, boolean>>(loadColumnPrefs);
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(visibleColumns));
    } catch {
      // ignore — purely a UI preference, fine to lose in private-browsing etc.
    }
  }, [visibleColumns]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileViewMenuOpen, setMobileViewMenuOpen] = useState(false);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_PAGE_SIZE);
  const [mobileSelectMode, setMobileSelectMode] = useState(false);

  const viewParam = searchParams.get("view");
  const initialView = viewParam === "attention" ? "Needs Attention" : QUICK_VIEWS.includes(viewParam as QuickView) ? (viewParam as QuickView) : "All";
  const [quickView, setQuickView] = useState<QuickView>(initialView);

  // Reset the mobile incremental-load window whenever the underlying result set
  // changes shape, so switching views/filters doesn't leave a stale "Load more"
  // position (e.g. 60 loaded) applied to a totally different, possibly shorter, list.
  useEffect(() => {
    setMobileVisibleCount(MOBILE_PAGE_SIZE);
  }, [quickView, filters, columnFilters]);

  // A link-only filter (e.g. from Dashboard's Needs Attention breakdown) that isn't one of
  // the 7 quick-view pills — doesn't touch the sticky bar, just narrows the table further.
  const showInvalidOnly = searchParams.get("special") === "invalid-numbers";

  const filtered = useMemo(() => applyFilters(leads, filters), [leads, filters]);
  const attentionLeadIds = useMemo(() => new Set(computeAttentionFlags(filtered).map((f) => f.lead.id)), [filtered]);
  const quickViewFiltered = useMemo(() => {
    let base = filtered.filter((lead) => matchesQuickView(quickView, lead, user?.uid));
    if (quickView === "Needs Attention") base = base.filter((l) => attentionLeadIds.has(l.id));
    if (showInvalidOnly) base = base.filter((l) => !isValidLeadPhone(l.parentPhone));
    return base;
  }, [filtered, quickView, user?.uid, attentionLeadIds, showInvalidOnly]);

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
  const openLead = useMemo(() => leads.find((l) => l.id === openLeadId) ?? null, [leads, openLeadId]);
  // Mobile list is windowed ("Load more") so it never mounts hundreds of rows at
  // once — the desktop table instead relies on native row virtualization-free
  // rendering inside its own scroll container, which measured fine at the sizes
  // this CRM runs at; this is specifically for the no-virtualization mobile cards.
  const mobileVisible = useMemo(() => visible.slice(0, mobileVisibleCount), [visible, mobileVisibleCount]);

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
    await deleteLead(lead, user!.uid, staffName(user?.uid ?? null));
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

  // One removable chip per active field (not just a count) — the committed
  // FilterBar filters, plus the two link-only filters NewLead/Dashboard can
  // arrive with (status-from-URL and the "invalid numbers" special filter).
  const filterChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.staffId === "__unassigned__") {
    filterChips.push({ key: "staffId", label: "Unassigned", onRemove: () => setFilters((f) => ({ ...f, staffId: "" })) });
  } else if (filters.staffId) {
    filterChips.push({ key: "staffId", label: staffName(filters.staffId), onRemove: () => setFilters((f) => ({ ...f, staffId: "" })) });
  }
  if (filters.status) filterChips.push({ key: "status", label: filters.status, onRemove: () => setFilters((f) => ({ ...f, status: "" })) });
  if (filters.sourceChannel) filterChips.push({ key: "sourceChannel", label: filters.sourceChannel, onRemove: () => setFilters((f) => ({ ...f, sourceChannel: "" })) });
  if (filters.programId) filterChips.push({ key: "programId", label: programName(filters.programId), onRemove: () => setFilters((f) => ({ ...f, programId: "" })) });
  if (filters.campaignId) {
    filterChips.push({
      key: "campaignId",
      label: campaigns.find((c) => c.id === filters.campaignId)?.name ?? "Campaign",
      onRemove: () => setFilters((f) => ({ ...f, campaignId: "" })),
    });
  }
  if (filters.branchId) {
    filterChips.push({
      key: "branchId",
      label: branches.find((b) => b.id === filters.branchId)?.name ?? "Branch",
      onRemove: () => setFilters((f) => ({ ...f, branchId: "" })),
    });
  }
  if (filters.dateFrom) filterChips.push({ key: "dateFrom", label: `Enquiry from ${filters.dateFrom}`, onRemove: () => setFilters((f) => ({ ...f, dateFrom: "" })) });
  if (filters.dateTo) filterChips.push({ key: "dateTo", label: `Enquiry to ${filters.dateTo}`, onRemove: () => setFilters((f) => ({ ...f, dateTo: "" })) });
  if (filters.followUpFrom) filterChips.push({ key: "followUpFrom", label: `Follow-up from ${filters.followUpFrom}`, onRemove: () => setFilters((f) => ({ ...f, followUpFrom: "" })) });
  if (filters.followUpTo) filterChips.push({ key: "followUpTo", label: `Follow-up to ${filters.followUpTo}`, onRemove: () => setFilters((f) => ({ ...f, followUpTo: "" })) });
  if (showInvalidOnly) {
    filterChips.push({ key: "invalid", label: "Invalid mobile numbers", onRemove: () => setSearchParams((p) => { const next = new URLSearchParams(p); next.delete("special"); return next; }) });
  }

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col">
      <div className="shrink-0">
      {/* Mobile-only compact heading — a dedicated layout, not the desktop
          heading shrunk down: title + live lead count + a search toggle,
          no description paragraph, and Stats/Analytics/Followups tucked into
          a small menu instead of a tab row (mobile requirements B2/B5). */}
      <div className="sm:hidden flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h1 className="font-display text-[20px] font-semibold text-ink leading-tight">{tab === "Data table" ? "Enquiries" : tab}</h1>
          <div className="text-[11px] text-ink-faint mt-0.5">{leads.length} lead{leads.length === 1 ? "" : "s"}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label="Search"
            aria-expanded={mobileSearchOpen}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center ${mobileSearchOpen ? "border-accent text-accent bg-accent-soft" : "border-border text-ink-soft"}`}
          >
            <Search className="w-4 h-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMobileViewMenuOpen((v) => !v)}
              aria-label="Switch view"
              aria-expanded={mobileViewMenuOpen}
              className={`w-9 h-9 rounded-lg border flex items-center justify-center ${tab !== "Data table" ? "border-accent text-accent bg-accent-soft" : "border-border text-ink-soft"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            {mobileViewMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMobileViewMenuOpen(false)} />
                <div className="absolute right-0 mt-1 z-20 w-44 bg-surface border border-border rounded-xl shadow-elevated p-1.5">
                  {TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => { setTab(t.key); setMobileViewMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${tab === t.key ? "text-accent bg-accent-soft font-semibold" : "text-ink-soft hover:bg-surface-2"}`}
                    >
                      <t.icon className="w-4 h-4" /> {t.key}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {mobileSearchOpen && (
        <div className="sm:hidden relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
          <input
            autoFocus
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search name, phone or lead ID"
            className="w-full rounded-xl border border-border bg-surface pl-9 pr-8 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-[3px] focus:ring-accent/15 focus:border-accent"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, search: "" }))}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Desktop/tablet heading + tab row */}
      <div className="hidden sm:block">
        <SectionHeading title="Enquiries" description="Manage and track all your student enquiries in one place." compact />
        <div role="tablist" aria-label="Enquiry views" className="flex flex-wrap gap-1 mb-2 border-b border-border-soft overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`relative inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 -mb-px border-b-2 whitespace-nowrap transition-colors ${
                  active ? "border-accent text-accent" : "border-transparent text-ink-soft hover:text-ink hover:border-ink-faint/30"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.key}
              </button>
            );
          })}
        </div>
      </div>

      <FilterBar filters={filters} onApply={setFilters} />

      {filterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {filterChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent-strong text-[11px] font-semibold pl-2.5 pr-1.5 py-1 hover:bg-accent/15 max-w-full"
            >
              <span className="truncate">{c.label}</span> <X className="w-3 h-3 shrink-0" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setFilters(EMPTY_FILTERS); setSearchParams({}); }}
            className="text-[11px] font-semibold text-ink-faint hover:text-accent-strong ml-0.5 shrink-0"
          >
            Clear all
          </button>
        </div>
      )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
      {tab === "Data table" && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/*
            shrink-0, placed before the table's own flex-1 scroll area — so this bar
            stays pinned above the table (no new scrollbar) while the table area
            below flexes to fill whatever space remains, scrolling independently.
          */}
          <div className="shrink-0 mb-2 flex items-center justify-between gap-3 bg-surface border border-border-soft rounded-xl shadow-[var(--shadow-card)] px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <SegmentedControl options={segments} value={quickView} onChange={chooseView} />
            </div>
            <div className="text-xs text-ink-faint shrink-0">
              <span className="font-semibold text-ink-soft">{visible.length}</span> / {leads.length}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
            <h2 className="hidden sm:block font-semibold text-[13.5px] text-ink-soft uppercase tracking-wide shrink-0">All Enquiries</h2>
            <div className="flex flex-wrap items-center gap-2 justify-end flex-1 sm:flex-initial">
              {/* Secondary actions: inline on sm+, tucked behind "More" on phones so the
                  toolbar never wraps to 3 lines above the list (mobile requirement #7). */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="relative">
                  <Button variant="secondary" size="sm" onClick={() => setShowWhatsApp((v) => !v)} disabled={selected.size === 0} className="!bg-good/10 !text-good !border-good/20 hover:!bg-good/15">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                  {showWhatsApp && selected.size > 0 && (
                    <div className="absolute right-0 mt-1 z-20 w-64 bg-surface border border-border rounded-xl shadow-elevated p-2 max-h-64 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => { setShowBulkSend(true); setShowWhatsApp(false); }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-semibold text-accent hover:bg-accent-soft mb-1 border-b border-border-soft pb-2.5"
                      >
                        <Send className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Send custom message to all {selected.size}…</span>
                      </button>
                      {selectedLeads.map((l) => {
                        const link = buildWhatsAppLink(l.parentPhone, l.parentName, l.sourceChannel);
                        return link ? (
                          <a
                            key={l.id}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setShowWhatsApp(false)}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-surface-2"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-good shrink-0" />
                            <span className="truncate">{l.parentName} · {l.childName}</span>
                          </a>
                        ) : (
                          <div key={l.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-ink-faint opacity-60" title="Invalid/unverified mobile number">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{l.parentName} · {l.childName}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {canExportData(role) && (
                  <Button variant="secondary" size="sm" onClick={exportCsv}><Download className="w-3.5 h-3.5" /> Export</Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}><Upload className="w-3.5 h-3.5" /> Upload</Button>
                <div className="relative">
                  <Button variant="secondary" size="sm" onClick={() => setColumnsMenuOpen((v) => !v)}>
                    <Columns3 className="w-3.5 h-3.5" /> Columns
                  </Button>
                  {columnsMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setColumnsMenuOpen(false)} />
                      <div className="absolute right-0 mt-1 z-20 w-48 bg-surface border border-border rounded-xl shadow-elevated p-2">
                        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold px-2 py-1">Show columns</div>
                        {TOGGLEABLE_COLUMNS.map((col) => (
                          <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-ink-soft hover:bg-surface-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={visibleColumns[col]}
                              onChange={(e) => setVisibleColumns((v) => ({ ...v, [col]: e.target.checked }))}
                              className="rounded border-border"
                            />
                            {COLUMN_LABELS[col]}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="relative sm:hidden">
                <Button variant="secondary" size="sm" onClick={() => setMoreMenuOpen((v) => !v)} aria-label="More actions">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
                {moreMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMoreMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 z-20 w-56 bg-surface border border-border rounded-xl shadow-elevated p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSelectMode((v) => {
                            const next = !v;
                            if (!next) setSelected(new Set());
                            return next;
                          });
                          setMoreMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink-soft hover:bg-surface-2"
                      >
                        <CheckSquare className="w-4 h-4" /> {mobileSelectMode ? "Cancel select" : "Select leads"}
                      </button>
                      <button
                        type="button"
                        disabled={selected.size === 0}
                        onClick={() => { setShowWhatsApp(true); setMoreMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-good hover:bg-good-soft disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <MessageCircle className="w-4 h-4" /> WhatsApp {selected.size > 0 ? `(${selected.size})` : ""}
                      </button>
                      {canExportData(role) && (
                        <button type="button" onClick={() => { exportCsv(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink-soft hover:bg-surface-2">
                          <Download className="w-4 h-4" /> Export
                        </button>
                      )}
                      <button type="button" onClick={() => { setShowImport(true); setMoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink-soft hover:bg-surface-2">
                        <Upload className="w-4 h-4" /> Upload
                      </button>
                      <button type="button" onClick={() => { setColumnsMenuOpen(true); setMoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink-soft hover:bg-surface-2">
                        <Columns3 className="w-4 h-4" /> Columns
                      </button>
                    </div>
                  </>
                )}
                {/* The Columns checklist panel itself is shared with the desktop trigger above. */}
                {columnsMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setColumnsMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 z-20 w-48 bg-surface border border-border rounded-xl shadow-elevated p-2">
                      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold px-2 py-1">Show columns</div>
                      {TOGGLEABLE_COLUMNS.map((col) => (
                        <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-ink-soft hover:bg-surface-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={visibleColumns[col]}
                            onChange={(e) => setVisibleColumns((v) => ({ ...v, [col]: e.target.checked }))}
                            className="rounded border-border"
                          />
                          {COLUMN_LABELS[col]}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {(Object.values(filters).some(Boolean) || Object.values(columnFilters).some(Boolean)) && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setFilters(EMPTY_FILTERS);
                    setColumnFilters(EMPTY_COLUMN_FILTERS);
                  }}
                >
                  <X className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Clear Filters</span>
                </Button>
              )}
              <Link to="/leads/new" className="hidden sm:block">
                <Button size="sm"><UserPlus className="w-3.5 h-3.5" /> Add Enquiry</Button>
              </Link>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 bg-accent-soft border border-accent/20 rounded-xl px-4 py-3 mb-3 shrink-0">
              <span className="text-sm font-semibold text-accent-strong shrink-0">{selected.size} selected</span>
              <div className="flex items-center gap-1.5">
                <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as LeadStatus)} className="py-1.5 text-[13px] w-44">
                  <optgroup label="Open">{OPEN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
                  <optgroup label="Closed">{CLOSED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
                </Select>
                <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={runBulkStatus}>Update Status</Button>
              </div>
              {isAdminRole(role) && (
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
          {bulkMessage && <div className="text-xs text-ink-soft mb-3 px-1 shrink-0">{bulkMessage}</div>}

          <div className="flex-1 min-h-0 bg-surface border border-border-soft rounded-2xl shadow-elevated overflow-hidden flex flex-col">
            <div className="hidden lg:block flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm table-fixed">
                <thead className="text-ink-faint text-[11px] uppercase tracking-wide">
                  <tr className="h-9">
                    <th className="sticky top-0 left-0 z-40 bg-surface-2 px-3 py-2 w-10">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="rounded border-border" aria-label="Select all" />
                    </th>
                    <th className="sticky top-0 left-10 z-40 bg-surface-2 text-left px-2 py-2 w-[220px]">Name</th>
                    <th className="sticky top-0 left-[264px] z-40 bg-surface-2 text-left px-2 py-2 w-[120px]">Status</th>
                    <th className="sticky top-0 left-[384px] z-40 bg-surface-2 text-left px-2 py-2 w-[145px] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">Mobile</th>
                    <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[85px]">Priority</th>
                    <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[125px]">Follow-up</th>
                    {visibleColumns.course && <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[125px]">Course</th>}
                    {visibleColumns.fees && <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[85px]">Fees</th>}
                    {visibleColumns.source && <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[115px]">Source</th>}
                    {visibleColumns.location && <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[105px]">Location</th>}
                    {visibleColumns.remarks && <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[190px]">Remarks</th>}
                    {visibleColumns.admin && <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[105px]">Admin</th>}
                    <th className="sticky top-0 z-30 bg-surface-2 text-left px-2 py-2 w-[135px]">Actions</th>
                  </tr>
                  <tr className="h-9">
                    <td className="sticky top-9 left-0 z-40 bg-surface px-3 py-1" />
                    <ColumnSearchCell className="sticky top-9 left-10 z-40 bg-surface" value={columnFilters.name} onChange={(v) => setColumnFilters((c) => ({ ...c, name: v }))} />
                    <td className="sticky top-9 left-[264px] z-40 bg-surface px-2 py-1" />
                    <ColumnSearchCell className="sticky top-9 left-[384px] z-40 bg-surface shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]" value={columnFilters.mobile} onChange={(v) => setColumnFilters((c) => ({ ...c, mobile: v }))} />
                    <td className="sticky top-9 z-30 bg-surface px-2 py-1" />
                    <td className="sticky top-9 z-30 bg-surface px-2 py-1" />
                    {visibleColumns.course && <ColumnSearchCell className="sticky top-9 z-30 bg-surface" value={columnFilters.course} onChange={(v) => setColumnFilters((c) => ({ ...c, course: v }))} />}
                    {visibleColumns.fees && <td className="sticky top-9 z-30 bg-surface px-2 py-1" />}
                    {visibleColumns.source && <ColumnSearchCell className="sticky top-9 z-30 bg-surface" value={columnFilters.source} onChange={(v) => setColumnFilters((c) => ({ ...c, source: v }))} />}
                    {visibleColumns.location && <ColumnSearchCell className="sticky top-9 z-30 bg-surface" value={columnFilters.location} onChange={(v) => setColumnFilters((c) => ({ ...c, location: v }))} />}
                    {visibleColumns.remarks && <ColumnSearchCell className="sticky top-9 z-30 bg-surface" value={columnFilters.remarks} onChange={(v) => setColumnFilters((c) => ({ ...c, remarks: v }))} />}
                    {visibleColumns.admin && <ColumnSearchCell className="sticky top-9 z-30 bg-surface" value={columnFilters.admin} onChange={(v) => setColumnFilters((c) => ({ ...c, admin: v }))} />}
                    <td className="sticky top-9 z-30 bg-surface px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((lead) => {
                    const unseen = isLeadUnseen(lead);
                    const isSelected = selected.has(lead.id);
                    const stickyBg = unseen ? "" : isSelected ? "bg-accent-soft" : "bg-surface group-hover:bg-surface-2";
                    return (
                    <tr
                      key={lead.id}
                      onClick={() => setOpenLeadId(lead.id)}
                      className={`group border-t border-border-soft transition-colors cursor-pointer ${unseen ? "lead-unseen-row" : isSelected ? "bg-accent-soft/40" : "hover:bg-surface-2/50"}`}
                    >
                      <td className={`sticky left-0 z-20 px-3 py-2.5 overflow-hidden ${stickyBg}`} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(lead.id)} className="rounded border-border" aria-label={`Select ${lead.parentName}`} />
                      </td>
                      <td className={`sticky left-10 z-20 px-2 py-2.5 overflow-hidden ${stickyBg}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center text-[10.5px] font-bold shrink-0">
                            {initials(lead.childName)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-[13.5px] text-ink group-hover:text-accent truncate">{lead.childName}</span>
                              {unseen && <Badge tone="warn">NEW</Badge>}
                            </div>
                            {!sameName(lead.parentName, lead.childName) && (
                              <div className="text-ink-faint text-[11.5px] truncate">{lead.parentName}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`sticky left-[264px] z-20 px-2 py-2.5 overflow-hidden ${stickyBg}`}><StatusPill status={lead.status} /></td>
                      <td className={`sticky left-[384px] z-20 px-2 py-2.5 truncate shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] ${stickyBg}`}>
                        {isValidLeadPhone(lead.parentPhone) ? (
                          <span className="inline-flex items-center gap-1 text-ink-soft"><Phone className="w-3 h-3" />{lead.parentPhone}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-warn" title={lead.parentPhone ? `Stored value couldn't be verified: ${lead.parentPhone}` : "No number on file"}>
                            <ShieldAlert className="w-3 h-3" /> Invalid Number
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 overflow-hidden"><PriorityPill priority={lead.priority} /></td>
                      <td className="px-2 py-2.5 overflow-hidden"><FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} /></td>
                      {visibleColumns.course && <td className="px-2 py-2.5 text-ink-soft truncate">{programName(lead.interestedProgramId)}</td>}
                      {visibleColumns.fees && <td className="px-2 py-2.5 text-ink-soft truncate">{lead.fees != null ? `₹${lead.fees.toLocaleString("en-IN")}` : "—"}</td>}
                      {visibleColumns.source && <td className="px-2 py-2.5 text-ink-soft truncate">{lead.sourceChannel}</td>}
                      {visibleColumns.location && <td className="px-2 py-2.5 text-ink-soft truncate">{lead.location ?? "—"}</td>}
                      {visibleColumns.remarks && <td className="px-2 py-2.5 text-ink-faint truncate" title={lead.notes ?? ""}>{lead.notes ?? "—"}</td>}
                      {visibleColumns.admin && <td className="px-2 py-2.5 text-ink-soft truncate">{staffName(lead.assignedStaffId)}</td>}
                      <td className="px-2 py-2.5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Link to={`/leads/${lead.id}`} aria-label="Open full profile" title="Open Full Profile" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-accent">
                            <Eye className="w-4 h-4" />
                          </Link>
                          {isValidLeadPhone(lead.parentPhone) ? (
                            <a href={`tel:${lead.parentPhone}`} aria-label="Call" title="Call" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-accent">
                              <Phone className="w-4 h-4" />
                            </a>
                          ) : (
                            <span aria-hidden className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint/30" title="No valid number to call">
                              <Phone className="w-4 h-4" />
                            </span>
                          )}
                          {(() => {
                            const link = buildWhatsAppLink(lead.parentPhone, lead.parentName, lead.sourceChannel);
                            return link ? (
                              <a href={link} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-good-soft hover:text-good">
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            ) : (
                              <span aria-hidden className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint/30" title="No valid number for WhatsApp">
                                <MessageCircle className="w-4 h-4" />
                              </span>
                            );
                          })()}
                          {isAdminRole(role) && (
                            <button onClick={() => onDeleteRow(lead)} aria-label="Delete" title="Delete Lead" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-bad-soft hover:text-bad">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {mobileSelectMode && visible.length > 0 && (
              <div className="lg:hidden flex items-center justify-between gap-2 px-3 py-2 border-b border-border-soft shrink-0 bg-surface-2">
                <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="rounded border-border" aria-label="Select all" />
                  Select all {visible.length}
                </label>
                {selected.size > 0 && (
                  <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-semibold text-accent hover:underline">
                    Clear ({selected.size})
                  </button>
                )}
              </div>
            )}

            <div className="lg:hidden flex-1 min-h-0 overflow-y-auto divide-y divide-border-soft pb-20">
              {mobileVisible.map((lead) => {
                const unseen = isLeadUnseen(lead);
                const validPhone = isValidLeadPhone(lead.parentPhone);
                const namesDiffer = !sameName(lead.parentName, lead.childName);
                return (
                <div
                  key={lead.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenLeadId(lead.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") setOpenLeadId(lead.id); }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 active:bg-surface-2/60 ${unseen ? "lead-unseen-card" : ""}`}
                >
                  {mobileSelectMode && (
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-border shrink-0"
                      aria-label={`Select ${lead.parentName}`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[14.5px] text-ink truncate">{lead.parentName}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {unseen && <Badge tone="warn">NEW</Badge>}
                        <StatusPill status={lead.status} />
                      </div>
                    </div>
                    {(namesDiffer || validPhone) && (
                      <div className="text-[11.5px] text-ink-faint truncate mt-0.5">
                        {namesDiffer && lead.childName}
                        {namesDiffer && validPhone && " · "}
                        {validPhone ? lead.parentPhone : !namesDiffer && <span className="text-warn">Invalid number</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <PriorityPill priority={lead.priority} />
                      <FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} />
                      <span className="text-[11px] text-ink-faint truncate">{lead.sourceChannel}</span>
                    </div>
                  </div>
                  {validPhone ? (
                    <a
                      href={`tel:${lead.parentPhone}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Call ${lead.parentName}`}
                      className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-accent bg-accent-soft"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  ) : (
                    <span aria-hidden title="No valid number to call" className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-ink-faint/30">
                      <Phone className="w-4 h-4" />
                    </span>
                  )}
                </div>
                );
              })}
              {visible.length > mobileVisibleCount && (
                <div className="p-3">
                  <button
                    type="button"
                    onClick={() => setMobileVisibleCount((c) => c + MOBILE_PAGE_SIZE)}
                    className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface-2"
                  >
                    Load more ({visible.length - mobileVisibleCount} remaining)
                  </button>
                </div>
              )}
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

        </div>
      )}

      {tab === "Stats" && <div className="flex-1 min-h-0 overflow-auto pb-8"><StatsTab leads={visible} /></div>}
      {tab === "Analytics" && <div className="flex-1 min-h-0 overflow-auto pb-8"><AnalyticsTab leads={visible} staffName={staffName} /></div>}
      {tab === "Followups" && <div className="flex-1 min-h-0 overflow-auto pb-8"><FollowupsTab leads={visible} programName={programName} /></div>}
      </div>

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

      {showBulkSend && (
        <BulkSendWhatsAppModal leads={selectedLeads} staffId={user!.uid} onClose={() => setShowBulkSend(false)} />
      )}

      {openLead && (
        <LeadDrawer lead={openLead} onClose={() => setOpenLeadId(null)} programName={programName} branchName={branchName} staffName={staffName} />
      )}

      {/* Floating Add Enquiry — mobile only; the toolbar's own Add Enquiry button
          (sm:hidden above) covers desktop, so the two are never shown together. */}
      <Link
        to="/leads/new"
        aria-label="Add Enquiry"
        className="sm:hidden fixed z-30 bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 px-5 inline-flex items-center gap-2 rounded-full bg-accent text-white font-semibold text-sm shadow-elevated active:scale-[0.97] transition-transform focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
        style={{ height: "52px" }}
      >
        <Plus className="w-5 h-5" />
        Add Enquiry
      </Link>
    </div>
  );
}

function ColumnSearchCell({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <td className={`px-2 py-1.5 ${className ?? ""}`}>
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
  const overdue = leads.filter((l) => isFollowUpOverdue(l)).length;
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
    if (isClosedStatus(l.status)) continue;
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

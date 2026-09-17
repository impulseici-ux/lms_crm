import { useEffect, useState } from "react";
import { Select, Input, Button } from "@/components/ui";
import { useLookups } from "@/hooks/useLookups";
import { OPEN_STATUSES, CLOSED_STATUSES } from "@/types";
import { Search, SlidersHorizontal, X, CalendarDays, ArrowUpNarrowWide, ArrowDownNarrowWide } from "lucide-react";

export type SortField = "createdAt" | "nextFollowUpAt" | "parentName" | "priority" | "fees";
export type SortDirection = "asc" | "desc";

export interface Filters {
  search: string;
  dateFrom: string;
  dateTo: string;
  followUpFrom: string;
  followUpTo: string;
  staffId: string;
  sourceChannel: string;
  campaignId: string;
  programId: string;
  status: string;
  branchId: string;
  sortBy: SortField;
  sortDirection: SortDirection;
}

export const EMPTY_FILTERS: Filters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  followUpFrom: "",
  followUpTo: "",
  staffId: "",
  sourceChannel: "",
  campaignId: "",
  programId: "",
  status: "",
  branchId: "",
  sortBy: "createdAt",
  sortDirection: "desc",
};

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "createdAt", label: "Enquiry date" },
  { value: "nextFollowUpAt", label: "Follow-up date" },
  { value: "parentName", label: "Name" },
  { value: "priority", label: "Priority" },
  { value: "fees", label: "Fees" },
];

function countActive(f: Filters): number {
  const { search, sortBy, sortDirection, ...rest } = f;
  void search;
  void sortBy;
  void sortDirection;
  return Object.values(rest).filter(Boolean).length;
}

/** Staged filter bar: edits are local until "Apply Filters" commits them, matching a dense CRM data-grid pattern. */
export function FilterBar({ filters, onApply }: { filters: Filters; onApply: (f: Filters) => void }) {
  const { leadSources, programs, branches, campaigns, users } = useLookups();
  const [draft, setDraft] = useState<Filters>(filters);
  useEffect(() => setDraft(filters), [filters]);

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const active = countActive(filters);
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);

  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5 sm:p-4 mb-5">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end mb-3">
        <div className="lg:w-[240px] shrink-0">
          <label className="block text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
            <Input
              value={draft.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Parent, child or phone…"
              className="pl-9"
              aria-label="Search leads by parent, child or phone number"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1">
          <DateField label="Enquiry from" value={draft.dateFrom} onChange={(v) => set({ dateFrom: v })} />
          <DateField label="Enquiry to" value={draft.dateTo} onChange={(v) => set({ dateTo: v })} />
          <DateField label="Follow-up from" value={draft.followUpFrom} onChange={(v) => set({ followUpFrom: v })} />
          <DateField label="Follow-up to" value={draft.followUpTo} onChange={(v) => set({ followUpTo: v })} />
        </div>
        <Button onClick={() => onApply(draft)} className="lg:mb-0 shrink-0">
          <SlidersHorizontal className="w-4 h-4" /> Apply Filters
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-2.5">
        <div>
          <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Staff</label>
          <Select value={draft.staffId} onChange={(e) => set({ staffId: e.target.value })} className="py-1.5 text-[13px]">
            <option value="">All staff</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Course</label>
          <Select value={draft.programId} onChange={(e) => set({ programId: e.target.value })} className="py-1.5 text-[13px]">
            <option value="">All courses</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Status</label>
          <Select value={draft.status} onChange={(e) => set({ status: e.target.value })} className="py-1.5 text-[13px]">
            <option value="">All statuses</option>
            <optgroup label="Open">{OPEN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
            <optgroup label="Closed">{CLOSED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
          </Select>
        </div>
        <div>
          <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Source</label>
          <Select value={draft.sourceChannel} onChange={(e) => set({ sourceChannel: e.target.value })} className="py-1.5 text-[13px]">
            <option value="">All sources</option>
            {leadSources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Campaign</label>
          <Select value={draft.campaignId} onChange={(e) => set({ campaignId: e.target.value })} className="py-1.5 text-[13px]">
            <option value="">All campaigns</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        {branches.length > 0 && (
          <div>
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Branch</label>
            <Select value={draft.branchId} onChange={(e) => set({ branchId: e.target.value })} className="py-1.5 text-[13px]">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
        )}
        <div className="flex items-end gap-1.5 col-span-2 sm:col-span-2">
          <div className="flex-1">
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Sort by</label>
            <Select value={draft.sortBy} onChange={(e) => set({ sortBy: e.target.value as SortField })} className="py-1.5 text-[13px]">
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <button
            type="button"
            onClick={() => set({ sortDirection: draft.sortDirection === "asc" ? "desc" : "asc" })}
            aria-label={draft.sortDirection === "asc" ? "Ascending" : "Descending"}
            title={draft.sortDirection === "asc" ? "Ascending" : "Descending"}
            className="shrink-0 h-[38px] w-[38px] rounded-xl border border-border bg-surface flex items-center justify-center text-ink-soft hover:bg-surface-2"
          >
            {draft.sortDirection === "asc" ? <ArrowUpNarrowWide className="w-4 h-4" /> : <ArrowDownNarrowWide className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-3.5 pt-3 border-t border-border-soft">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
          {dirty ? (
            <span className="text-warn font-semibold">Filters changed — click Apply Filters</span>
          ) : active > 0 ? (
            `${active} filter${active === 1 ? "" : "s"} active`
          ) : (
            "Showing all matching leads"
          )}
        </span>
        {(active > 0 || filters.search) && (
          <button
            type="button"
            onClick={() => { setDraft(EMPTY_FILTERS); onApply(EMPTY_FILTERS); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-bad transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear all
          </button>
        )}
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1 flex items-center gap-1">
        <CalendarDays className="w-3 h-3" /> {label}
      </label>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="py-1.5 text-[13px]" />
    </div>
  );
}

export function applyFilters<T extends {
  parentName: string;
  childName: string;
  parentPhone: string;
  createdAt: { toDate: () => Date } | null;
  nextFollowUpAt: { toDate: () => Date } | null;
  assignedStaffId: string | null;
  sourceChannel: string;
  campaignId: string | null;
  interestedProgramId: string | null;
  status: string;
  branchId: string | null;
  priority: string;
  fees: number | null;
}>(rows: T[], f: Filters): T[] {
  const query = f.search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (query) {
      const haystack = `${r.parentName} ${r.childName} ${r.parentPhone}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (f.dateFrom && r.createdAt && r.createdAt.toDate() < new Date(f.dateFrom)) return false;
    if (f.dateTo && r.createdAt) {
      const to = new Date(f.dateTo);
      to.setHours(23, 59, 59, 999);
      if (r.createdAt.toDate() > to) return false;
    }
    if (f.followUpFrom && (!r.nextFollowUpAt || r.nextFollowUpAt.toDate() < new Date(f.followUpFrom))) return false;
    if (f.followUpTo) {
      const to = new Date(f.followUpTo);
      to.setHours(23, 59, 59, 999);
      if (!r.nextFollowUpAt || r.nextFollowUpAt.toDate() > to) return false;
    }
    if (f.staffId && r.assignedStaffId !== f.staffId) return false;
    if (f.sourceChannel && r.sourceChannel !== f.sourceChannel) return false;
    if (f.campaignId && r.campaignId !== f.campaignId) return false;
    if (f.programId && r.interestedProgramId !== f.programId) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.branchId && r.branchId !== f.branchId) return false;
    return true;
  });

  const dir = f.sortDirection === "asc" ? 1 : -1;
  const priorityRank: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  return [...filtered].sort((a, b) => {
    switch (f.sortBy) {
      case "parentName":
        return a.parentName.localeCompare(b.parentName) * dir;
      case "priority":
        return ((priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)) * dir;
      case "fees":
        return ((a.fees ?? -1) - (b.fees ?? -1)) * dir;
      case "nextFollowUpAt": {
        const at = a.nextFollowUpAt?.toDate().getTime() ?? 0;
        const bt = b.nextFollowUpAt?.toDate().getTime() ?? 0;
        return (at - bt) * dir;
      }
      case "createdAt":
      default: {
        const at = a.createdAt?.toDate().getTime() ?? 0;
        const bt = b.createdAt?.toDate().getTime() ?? 0;
        return (at - bt) * dir;
      }
    }
  });
}

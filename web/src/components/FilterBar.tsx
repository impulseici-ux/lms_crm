import { Select, Input } from "@/components/ui";
import { useLookups } from "@/hooks/useLookups";
import { OPEN_STATUSES, CLOSED_STATUSES } from "@/types";
import { Search, SlidersHorizontal, X } from "lucide-react";

export interface Filters {
  search: string;
  dateFrom: string;
  dateTo: string;
  staffId: string;
  sourceChannel: string;
  campaignId: string;
  programId: string;
  status: string;
  branchId: string;
}

export const EMPTY_FILTERS: Filters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  staffId: "",
  sourceChannel: "",
  campaignId: "",
  programId: "",
  status: "",
  branchId: "",
};

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const { leadSources, programs, branches, campaigns, users } = useLookups();
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== "search" && Boolean(value)).length;

  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5 sm:p-4 mb-5">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
        <div className="lg:w-[280px] shrink-0">
          <label className="block text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
            <Input
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Parent, child or phone…"
              className="pl-9"
              aria-label="Search leads by parent, child or phone number"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1">
          <div>
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">From</label>
            <Input type="date" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className="py-1.5 text-[13px]" />
          </div>
          <div>
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">To</label>
            <Input type="date" value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })} className="py-1.5 text-[13px]" />
          </div>
          <div>
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Staff</label>
            <Select value={filters.staffId} onChange={(e) => set({ staffId: e.target.value })} className="py-1.5 text-[13px]">
              <option value="">All staff</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Source</label>
            <Select value={filters.sourceChannel} onChange={(e) => set({ sourceChannel: e.target.value })} className="py-1.5 text-[13px]">
              <option value="">All sources</option>
              {leadSources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Campaign</label>
            <Select value={filters.campaignId} onChange={(e) => set({ campaignId: e.target.value })} className="py-1.5 text-[13px]">
              <option value="">All campaigns</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Program</label>
            <Select value={filters.programId} onChange={(e) => set({ programId: e.target.value })} className="py-1.5 text-[13px]">
              <option value="">All programs</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Status</label>
            <Select value={filters.status} onChange={(e) => set({ status: e.target.value })} className="py-1.5 text-[13px]">
              <option value="">All statuses</option>
              <optgroup label="Open">{OPEN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
              <optgroup label="Closed">{CLOSED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
            </Select>
          </div>
          {branches.length > 0 && (
            <div>
              <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Branch</label>
              <Select value={filters.branchId} onChange={(e) => set({ branchId: e.target.value })} className="py-1.5 text-[13px]">
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 mt-3.5 pt-3 border-t border-border-soft">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active` : "Showing all matching leads"}
        </span>
        {(activeFilterCount > 0 || filters.search) && (
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-bad transition-colors">
            <X className="w-3.5 h-3.5" /> Clear all
          </button>
        )}
      </div>
    </div>
  );
}

export function applyFilters<T extends {
  parentName: string;
  childName: string;
  parentPhone: string;
  createdAt: { toDate: () => Date } | null;
  assignedStaffId: string | null;
  sourceChannel: string;
  campaignId: string | null;
  interestedProgramId: string | null;
  status: string;
  branchId: string | null;
}>(rows: T[], f: Filters): T[] {
  const query = f.search.trim().toLowerCase();
  return rows.filter((r) => {
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
    if (f.staffId && r.assignedStaffId !== f.staffId) return false;
    if (f.sourceChannel && r.sourceChannel !== f.sourceChannel) return false;
    if (f.campaignId && r.campaignId !== f.campaignId) return false;
    if (f.programId && r.interestedProgramId !== f.programId) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.branchId && r.branchId !== f.branchId) return false;
    return true;
  });
}

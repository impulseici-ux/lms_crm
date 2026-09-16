import { Select, Input } from "@/components/ui";
import { useLookups } from "@/hooks/useLookups";
import { OPEN_STATUSES, CLOSED_STATUSES } from "@/types";

export interface Filters {
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2 items-end bg-surface border border-border rounded-xl p-3 mb-5">
      <div>
        <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">From</label>
        <Input type="date" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className="py-1.5" />
      </div>
      <div>
        <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">To</label>
        <Input type="date" value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })} className="py-1.5" />
      </div>
      <div>
        <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Staff</label>
        <Select value={filters.staffId} onChange={(e) => set({ staffId: e.target.value })} className="py-1.5">
          <option value="">All</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </Select>
      </div>
      <div>
        <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Source</label>
        <Select value={filters.sourceChannel} onChange={(e) => set({ sourceChannel: e.target.value })} className="py-1.5">
          <option value="">All</option>
          {leadSources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </Select>
      </div>
      <div>
        <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Campaign</label>
        <Select value={filters.campaignId} onChange={(e) => set({ campaignId: e.target.value })} className="py-1.5">
          <option value="">All</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div>
        <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Program</label>
        <Select value={filters.programId} onChange={(e) => set({ programId: e.target.value })} className="py-1.5">
          <option value="">All</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <div>
        <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Status</label>
        <Select value={filters.status} onChange={(e) => set({ status: e.target.value })} className="py-1.5">
          <option value="">All</option>
          <optgroup label="Open">
            {OPEN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </optgroup>
          <optgroup label="Closed">
            {CLOSED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </optgroup>
        </Select>
      </div>
      {branches.length > 0 && (
        <div>
          <label className="block text-[11px] uppercase text-ink-faint font-semibold mb-1">Branch</label>
          <Select value={filters.branchId} onChange={(e) => set({ branchId: e.target.value })} className="py-1.5">
            <option value="">All</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        className="text-xs font-semibold text-accent hover:text-accent-strong text-left pb-2"
      >
        Clear filters
      </button>
    </div>
  );
}

export function applyFilters<T extends {
  createdAt: { toDate: () => Date } | null;
  assignedStaffId: string | null;
  sourceChannel: string;
  campaignId: string | null;
  interestedProgramId: string | null;
  status: string;
  branchId: string | null;
}>(rows: T[], f: Filters): T[] {
  return rows.filter((r) => {
    if (f.dateFrom && r.createdAt) {
      if (r.createdAt.toDate() < new Date(f.dateFrom)) return false;
    }
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

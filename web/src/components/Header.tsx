import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, LogOut, AlertTriangle, Clock, X, Repeat } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLeads } from "@/hooks/useLeads";
import { useToast } from "@/context/ToastContext";
import { computeHeadlineMetrics } from "@/utils/metrics";
import { isFollowUpOverdue, isFollowUpDueToday } from "@/utils/followUp";
import { switchRole } from "@/lib/data/onboarding";
import type { Role } from "@/types";

const SWITCHABLE_ROLES: { value: Role; label: string }[] = [
  { value: "superadmin", label: "Superadmin" },
  { value: "admin", label: "Admin" },
  { value: "management", label: "Management" },
  { value: "counsellor", label: "Counsellor" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const TODAY_FORMATTER = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** Desktop-only top bar — search, urgent-items bell, date, account menu. The
 * mobile header (hamburger + logo) in Layout.tsx is separate and unaffected. */
export function Header() {
  const { role, profile, signOut, user, refreshRole } = useAuth();
  const { leads } = useLeads();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const displayName = profile?.displayName ?? user?.email ?? "";

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const handleSwitchRole = async (target: Role) => {
    if (target === role || switching) return;
    setSwitching(true);
    try {
      await switchRole(target);
      await refreshRole();
      showToast(`Now testing as ${target}.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not switch role.", "error");
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return leads
      .filter(
        (l) =>
          l.parentName.toLowerCase().includes(q) ||
          l.childName.toLowerCase().includes(q) ||
          l.parentPhone.includes(q) ||
          l.id.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [leads, query]);

  const metrics = useMemo(() => computeHeadlineMetrics(leads), [leads]);
  const urgentLeads = useMemo(
    () =>
      leads
        .filter((l) => isFollowUpOverdue(l) || isFollowUpDueToday(l))
        .sort((a, b) => (isFollowUpOverdue(a) === isFollowUpOverdue(b) ? 0 : isFollowUpOverdue(a) ? -1 : 1))
        .slice(0, 5),
    [leads]
  );
  const urgentCount = metrics.overdueFollowUps + metrics.todayFollowUps;

  const goToLead = (id: string) => {
    setQuery("");
    setSearchOpen(false);
    navigate(`/leads/${id}`);
  };

  return (
    <header className="hidden lg:flex h-14 shrink-0 items-center gap-3 bg-surface border-b border-border px-5">
      <div ref={searchRef} className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search by name, phone number, or lead ID…"
          className="w-full rounded-lg border border-border bg-bg pl-9 pr-8 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-[3px] focus:ring-accent/15 focus:border-accent"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { setQuery(""); setSearchOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {searchOpen && query && (
          <div className="absolute left-0 right-0 mt-1.5 bg-surface border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden z-50">
            {searchResults.length === 0 ? (
              <div className="px-4 py-3 text-sm text-ink-faint">No leads match "{query}".</div>
            ) : (
              searchResults.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => goToLead(l.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-surface-2 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink truncate">{l.parentName} <span className="text-ink-faint font-normal">· {l.childName}</span></span>
                    <span className="block text-xs text-ink-faint">{l.parentPhone}</span>
                  </span>
                  <span className="text-xs text-ink-faint shrink-0">{l.status}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div ref={bellRef} className="relative">
          <button
            type="button"
            aria-label="Urgent items"
            onClick={() => setBellOpen((o) => !o)}
            className="relative w-8 h-8 rounded-lg border border-border flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
          >
            <Bell className="w-4 h-4" />
            {urgentCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[10px] font-bold flex items-center justify-center">
                {urgentCount > 99 ? "99+" : urgentCount}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 mt-1.5 w-80 bg-surface border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-border-soft font-semibold text-sm text-ink">Needs attention</div>
              {urgentLeads.length === 0 ? (
                <div className="px-4 py-4 text-sm text-ink-faint">Nothing overdue or due today.</div>
              ) : (
                <div className="divide-y divide-border-soft max-h-80 overflow-y-auto">
                  {urgentLeads.map((l) => {
                    const overdue = isFollowUpOverdue(l);
                    return (
                      <Link
                        key={l.id}
                        to={`/leads/${l.id}`}
                        onClick={() => setBellOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2 transition-colors"
                      >
                        {overdue ? <AlertTriangle className="w-4 h-4 text-bad shrink-0" /> : <Clock className="w-4 h-4 text-warn shrink-0" />}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink truncate">{l.parentName}</span>
                          <span className={`block text-xs ${overdue ? "text-bad" : "text-warn"}`}>{overdue ? "Overdue" : "Due today"}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
              <Link to="/leads?view=Overdue" onClick={() => setBellOpen(false)} className="block px-4 py-2.5 text-center text-xs font-semibold text-accent hover:bg-surface-2 border-t border-border-soft">
                View all
              </Link>
            </div>
          )}
        </div>

        <div className="hidden xl:flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-ink-soft whitespace-nowrap">
          {TODAY_FORMATTER.format(new Date())}
        </div>

        <div ref={accountRef} className="relative">
          <button type="button" onClick={() => setAccountOpen((o) => !o)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2 transition-colors">
            <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-[11px] font-bold shrink-0">
              {initials(displayName)}
            </div>
            <span className="hidden xl:block text-left">
              <span className="block text-[13px] font-semibold text-ink leading-tight">{displayName}</span>
              <span className="block text-[11px] text-ink-faint uppercase tracking-wide leading-tight">{role ?? "no role"}</span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-ink-faint" />
          </button>
          {accountOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-surface border border-border rounded-xl shadow-[var(--shadow-card)] overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-border-soft">
                <div className="text-sm font-semibold text-ink truncate">{displayName}</div>
                <div className="text-[11px] text-ink-faint uppercase tracking-wide">{role ?? "no role assigned"}</div>
              </div>
              {profile?.canSwitchRoles && (
                <div className="px-4 py-3 border-b border-border-soft">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint uppercase tracking-wide mb-2">
                    <Repeat className="w-3 h-3" /> Test as role
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SWITCHABLE_ROLES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        disabled={switching}
                        onClick={() => handleSwitchRole(r.value)}
                        className={`text-[12px] font-semibold rounded-lg px-2 py-1.5 transition-colors disabled:opacity-50 ${
                          role === r.value ? "bg-accent text-white" : "bg-surface-2 text-ink-soft hover:bg-surface-hover hover:text-ink"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {profile.trueRole && role !== profile.trueRole && (
                    <p className="text-[11px] text-warn mt-2">Testing as {role} — not your real role.</p>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-ink-soft hover:bg-surface-2 hover:text-bad transition-colors"
              >
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

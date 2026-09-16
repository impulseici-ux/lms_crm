import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Users, UserPlus, BarChart3, Settings, Menu, X, LogOut, GraduationCap } from "lucide-react";
import type { ComponentType } from "react";

const navItems: { to: string; label: string; roles: string[]; icon: ComponentType<{ className?: string }> }[] = [
  { to: "/", label: "Dashboard", roles: ["admin", "counsellor", "management"], icon: LayoutDashboard },
  { to: "/leads", label: "Enquiries", roles: ["admin", "counsellor", "management"], icon: Users },
  { to: "/leads/new", label: "New Lead", roles: ["admin", "counsellor"], icon: UserPlus },
  { to: "/reports", label: "Reports", roles: ["admin", "counsellor", "management"], icon: BarChart3 },
  { to: "/admin", label: "Admin", roles: ["admin"], icon: Settings },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Layout() {
  const { role, profile, signOut, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNav = navItems.filter((item) => !role || item.roles.includes(role));
  const displayName = profile?.displayName ?? user?.email ?? "";

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center shrink-0">
        <GraduationCap className="w-[18px] h-[18px]" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-ink-soft leading-none">Little Millennium</div>
        <div className="font-display font-semibold text-[15px] leading-tight mt-0.5 truncate text-sidebar-ink">Admissions CRM</div>
      </div>
    </div>
  );

  const navigation = (
    <nav className="px-3 space-y-0.5">
      {visibleNav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "bg-sidebar-active-bg text-white" : "text-sidebar-ink-soft hover:bg-sidebar-bg-raised hover:text-sidebar-ink"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" />}
              <item.icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? "text-white" : "text-sidebar-ink-soft group-hover:text-sidebar-ink"}`} />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const account = (
    <div className="p-4 border-t border-sidebar-border">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-[12px] font-bold shrink-0">
          {initials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sidebar-ink text-[13px] truncate">{displayName}</div>
          <div className="text-[11px] text-sidebar-ink-soft uppercase tracking-wide">{role ?? "no role assigned"}</div>
        </div>
        <button
          onClick={() => signOut()}
          aria-label="Sign out"
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-ink-soft hover:bg-sidebar-bg-raised hover:text-bad transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-sidebar-bg border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-accent text-white flex items-center justify-center">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="font-display font-semibold text-[15px] leading-tight text-sidebar-ink">Admissions CRM</div>
        </div>
        <button
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="rounded-lg border border-sidebar-border w-9 h-9 flex items-center justify-center text-sidebar-ink hover:bg-sidebar-bg-raised"
        >
          {mobileOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
        </button>
      </header>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMobileOpen(false)}>
          <aside
            className="absolute right-0 top-[57px] bottom-0 w-[min(18rem,88vw)] bg-sidebar-bg border-l border-sidebar-border shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto pt-2">{navigation}</div>
            {account}
          </aside>
        </div>
      )}

      <div className="min-h-screen lg:flex">
        <aside className="hidden lg:flex w-[248px] shrink-0 bg-sidebar-bg min-h-screen flex-col">
          {brand}
          <div className="flex-1">{navigation}</div>
          {account}
        </aside>
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

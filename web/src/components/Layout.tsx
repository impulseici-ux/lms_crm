import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", roles: ["admin", "counsellor", "management"] },
  { to: "/leads", label: "Leads", roles: ["admin", "counsellor", "management"] },
  { to: "/leads/new", label: "New Lead", roles: ["admin", "counsellor"] },
  { to: "/reports", label: "Reports", roles: ["admin", "counsellor", "management"] },
  { to: "/admin", label: "Admin", roles: ["admin"] },
];

export function Layout() {
  const { role, profile, signOut, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNav = navItems.filter((item) => !role || item.roles.includes(role));

  const navigation = (
    <nav className="p-3 space-y-1">
      {visibleNav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2.5 text-sm font-medium ${
              isActive ? "bg-accent-soft text-accent-strong" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  const account = (
    <div className="p-4 border-t border-border-soft text-xs">
      <div className="font-semibold text-ink truncate">{profile?.displayName ?? user?.email}</div>
      <div className="text-ink-faint uppercase tracking-wide">{role ?? "no role assigned"}</div>
      <button onClick={() => signOut()} className="mt-2 text-accent hover:text-accent-strong font-medium">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-surface border-b border-border-soft px-4 py-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-faint">Little Millennium</div>
          <div className="font-display font-semibold leading-tight">Admissions CRM</div>
        </div>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </header>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/20" onClick={() => setMobileOpen(false)}>
          <aside
            className="absolute right-0 top-[57px] bottom-0 w-[min(18rem,88vw)] bg-surface border-l border-border-soft shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto">{navigation}</div>
            {account}
          </aside>
        </div>
      )}

      <div className="min-h-screen lg:flex">
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-border-soft bg-surface min-h-screen flex-col">
          <div className="p-5 border-b border-border-soft">
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-faint">Little Millennium</div>
            <div className="font-display font-semibold text-lg leading-tight">Admissions CRM</div>
          </div>
          <div className="flex-1">{navigation}</div>
          {account}
        </aside>
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

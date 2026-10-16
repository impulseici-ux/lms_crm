import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Users, UserPlus, BarChart3, Settings, Menu, X, LogOut, MessageCircle, GraduationCap, Wallet, ArrowDownLeft, ArrowUpRight, UsersRound, FileBarChart } from "lucide-react";
import type { ComponentType } from "react";
import logo from "@/assets/brand/lm-singanallur-logo.webp";
import { Header } from "@/components/Header";

const navItems: { to: string; label: string; roles: string[]; icon: ComponentType<{ className?: string }> }[] = [
  { to: "/", label: "Dashboard", roles: ["admin", "superadmin", "counsellor", "management"], icon: LayoutDashboard },
  { to: "/leads", label: "Enquiries", roles: ["admin", "superadmin", "counsellor", "management"], icon: Users },
  { to: "/leads/new", label: "New Lead", roles: ["admin", "superadmin", "counsellor"], icon: UserPlus },
  { to: "/reports", label: "Reports", roles: ["admin", "superadmin", "counsellor", "management"], icon: BarChart3 },
  { to: "/whatsapp", label: "WhatsApp", roles: ["admin", "superadmin", "counsellor", "management"], icon: MessageCircle },
  { to: "/finance", label: "Finance overview", roles: ["admin", "superadmin", "management"], icon: Wallet },
  { to: "/finance/income", label: "Income register", roles: ["admin", "superadmin", "management"], icon: ArrowDownLeft },
  { to: "/finance/expenses", label: "Expense register", roles: ["admin", "superadmin", "management"], icon: ArrowUpRight },
  { to: "/finance/payroll", label: "Staff & payroll", roles: ["admin", "superadmin", "management"], icon: UsersRound },
  { to: "/finance/reports", label: "Finance reports", roles: ["admin", "superadmin", "management"], icon: FileBarChart },
  { to: "/admin", label: "Admin", roles: ["admin", "superadmin"], icon: Settings },
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
    <Link to="/" onClick={() => setMobileOpen(false)} className="lm-brand group flex h-[76px] shrink-0 items-center gap-3 border-b border-sidebar-border px-4 transition-colors hover:bg-sidebar-bg-raised">
      <span className="lm-brand-mark inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
        <img src={logo} alt="Little Millennium Singanallur" className="h-10 w-auto object-contain" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold tracking-wide text-sidebar-ink">Little Millennium</span>
        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-ink-soft">Singanallur</span>
      </span>
    </Link>
  );

  const navigation = (
    <nav aria-label="Main navigation" className="lm-nav px-3 py-4">
      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-ink-soft/75">Workspace</div>
      <div className="space-y-1">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? "bg-sidebar-active-bg text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                  : "text-sidebar-ink-soft hover:bg-sidebar-bg-raised hover:text-sidebar-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-accent" />}
                <item.icon className={`h-[17px] w-[17px] shrink-0 transition-colors ${isActive ? "text-white" : "text-sidebar-ink-soft group-hover:text-sidebar-ink"}`} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      <div className="mx-3 my-5 h-px bg-sidebar-border" />
      <div className="rounded-xl border border-sidebar-border bg-sidebar-bg-raised/70 p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-sidebar-ink-soft">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-sidebar-ink">School workspace</div>
            <div className="mt-0.5 text-[10px] text-sidebar-ink-soft">Admissions & operations</div>
          </div>
        </div>
      </div>
    </nav>
  );

  const account = (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-sidebar-bg-raised">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-[12px] font-bold text-white shadow-sm">
          {initials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-sidebar-ink">{displayName}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-sidebar-ink-soft">{role ?? "no role assigned"}</div>
        </div>
        <button
          onClick={() => signOut()}
          aria-label="Sign out"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-ink-soft transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // Keep the existing independent page/table scroll contexts intact. Leads.tsx owns
  // its table scroll; the shell owns the single page-level scroll context.
  return (
    <div className="lm-shell flex h-screen flex-col overflow-hidden bg-bg text-ink">
      <header className="lm-mobilebar flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar-bg px-3 lg:hidden">
        <Link to="/" onClick={() => setMobileOpen(false)} className="inline-flex rounded-lg bg-white p-1.5">
          <img src={logo} alt="Little Millennium Singanallur" className="h-7 w-auto object-contain" />
        </Link>
        <span className="mr-auto ml-3 text-[11px] font-medium tracking-wide text-sidebar-ink-soft">SINGANALLUR</span>
        <button
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-sidebar-border text-sidebar-ink transition-colors hover:bg-sidebar-bg-raised"
        >
          {mobileOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="lm-sidebar animate-slide-in-right absolute bottom-0 right-0 top-12 flex w-[min(19rem,90vw)] flex-col border-l border-sidebar-border bg-sidebar-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto">{brand}{navigation}</div>
            {account}
          </aside>
        </div>
      )}

      <div className="flex min-h-0 flex-1 lg:flex">
        <aside className="lm-sidebar hidden h-full w-[224px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg lg:flex">
          {brand}
          <div className="flex-1 overflow-y-auto">{navigation}</div>
          {account}
        </aside>
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <Header />
          <main className="lm-main min-w-0 flex-1 overflow-auto p-3 sm:p-4 lg:p-6 xl:p-7">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

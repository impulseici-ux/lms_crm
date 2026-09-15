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

  return (
    <div className="min-h-screen bg-bg text-ink flex">
      <aside className="w-64 shrink-0 border-r border-border-soft bg-surface min-h-screen flex flex-col">
        <div className="p-5 border-b border-border-soft">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-faint">Little Millennium</div>
          <div className="font-display font-semibold text-lg leading-tight">Admissions CRM</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems
            .filter((item) => !role || item.roles.includes(role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? "bg-accent-soft text-accent-strong" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="p-4 border-t border-border-soft text-xs">
          <div className="font-semibold text-ink">{profile?.displayName ?? user?.email}</div>
          <div className="text-ink-faint uppercase tracking-wide">{role ?? "no role assigned"}</div>
          <button
            onClick={() => signOut()}
            className="mt-2 text-accent hover:text-accent-strong font-medium"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

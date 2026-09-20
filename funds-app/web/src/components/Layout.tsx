import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ExportReminderGate from "./ExportReminderGate";
import DueReminderGate from "./DueReminderGate";
import NewEntryModal from "./NewEntryModal";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M3 11l9-8 9 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M6 8a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 004 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3.1-5 7-5s7 1.7 7 5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 15.2c2.9.4 5 1.9 5 4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs ${
        active ? "text-brand-600 dark:text-brand-100" : "text-slate-400 dark:text-slate-500"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, logout } = useAuth();
  const [newEntryOpen, setNewEntryOpen] = useState(false);

  useEffect(() => {
    function handler() {
      setNewEntryOpen(true);
    }
    window.addEventListener("open-new-entry", handler);
    return () => window.removeEventListener("open-new-entry", handler);
  }, []);

  const isManager = profile?.role === "manager";

  return (
    <div className="min-h-screen bg-slate-100 pb-20 dark:bg-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between bg-brand-900 px-4 py-3 text-white">
        <span className="text-lg font-semibold">Funds Tracker</span>
        <div className="flex items-center gap-3">
          <button
            onClick={logout}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20"
          >
            Log out
          </button>
          <Link
            to="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 font-semibold"
          >
            {profile?.name?.[0]?.toUpperCase() ?? "?"}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">{children}</main>

      {!isManager && (
        <>
          <ExportReminderGate />
          <DueReminderGate />
        </>
      )}

      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-slate-200 bg-white py-2 dark:border-slate-700 dark:bg-slate-800">
        {isManager ? (
          <>
            <NavItem to="/" icon={<HomeIcon />} label="Dashboard" />
            <NavItem to="/employees" icon={<UsersIcon />} label="Employees" />
            <NavItem to="/profile" icon={<UserIcon />} label="Profile" />
          </>
        ) : (
          <>
            <NavItem to="/" icon={<HomeIcon />} label="Home" />
            <NavItem to="/history" icon={<HistoryIcon />} label="History" />
            <button
              onClick={() => setNewEntryOpen(true)}
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg"
              aria-label="New entry"
            >
              <PlusIcon />
            </button>
            <NavItem to="/reminders" icon={<BellIcon />} label="Reminders" />
            <NavItem to="/profile" icon={<UserIcon />} label="Profile" />
          </>
        )}
      </nav>

      {!isManager && newEntryOpen && (
        <NewEntryModal onClose={() => setNewEntryOpen(false)} />
      )}
    </div>
  );
}

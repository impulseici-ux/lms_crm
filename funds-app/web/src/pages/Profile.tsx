import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function Profile() {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Profile</h1>

      <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{profile?.name}</p>
        <p className="text-sm text-slate-400">{profile?.email}</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-200">
          {profile?.role}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-white p-4 dark:bg-slate-800">
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">Dark mode</p>
          <p className="text-xs text-slate-400">Switch between light and dark themes.</p>
        </div>
        <button
          onClick={toggleTheme}
          className={`relative h-7 w-12 rounded-full transition ${
            theme === "dark" ? "bg-brand-600" : "bg-slate-300"
          }`}
          aria-label="Toggle dark mode"
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
              theme === "dark" ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>

      <button
        onClick={logout}
        className="w-full rounded-lg border border-red-300 py-2.5 font-semibold text-red-500"
      >
        Log out
      </button>
    </div>
  );
}

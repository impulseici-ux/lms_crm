import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      setError("Couldn't sign in. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-800"
      >
        <h1 className="mb-1 text-2xl font-bold text-brand-900 dark:text-white">Funds Tracker</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Sign in to continue</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          placeholder="you@company.com"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Password
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          placeholder="••••••••"
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Don't have an account? Ask your manager to add you.
        </p>
      </form>
    </div>
  );
}

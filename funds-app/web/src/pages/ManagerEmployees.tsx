import { useEffect, useState, type FormEvent } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import type { UserProfile } from "../types";

export default function ManagerEmployees() {
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(query(collection(db, "users"), where("role", "==", "employee")), (snap) => {
      setEmployees(snap.docs.map((d) => d.data() as UserProfile));
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const createEmployee = httpsCallable(functions, "createEmployee");
      await createEmployee({ name, email, password, role: "employee" });
      setName("");
      setEmail("");
      setPassword("");
      setShowForm(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't create this employee. On the Spark plan, use scripts/create-admin.mjs or scripts/set-role.mjs instead."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Employees</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
        >
          {showForm ? "Close" : "+ Add employee"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-4 dark:bg-slate-800">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password (min 6 chars)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create employee"}
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {employees.length === 0 && (
          <li className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 dark:bg-slate-800">
            No employees yet.
          </li>
        )}
        {employees.map((emp) => (
          <li key={emp.uid} className="flex items-center gap-3 rounded-xl bg-white p-3 dark:bg-slate-800">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-100">
              {emp.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-800 dark:text-slate-100">{emp.name}</p>
              <p className="text-xs text-slate-400">{emp.email}</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                emp.active
                  ? "bg-green-50 text-green-600 dark:bg-green-950"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-700"
              }`}
            >
              {emp.active ? "Active" : "Inactive"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

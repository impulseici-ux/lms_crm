import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { Transaction, TransactionType } from "../types";

type Filter = "all" | TransactionType;

export default function EmployeeHome() {
  const { user, profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "transactions"),
      where("employeeId", "==", user.uid),
      orderBy("date", "desc")
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, "id">) })));
    });
  }, [user]);

  const totals = useMemo(() => {
    const received = transactions.filter((t) => t.type === "received").reduce((s, t) => s + t.amount, 0);
    const spent = transactions.filter((t) => t.type === "spent").reduce((s, t) => s + t.amount, 0);
    return { received, spent, balance: received - spent };
  }, [transactions]);

  const visible = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);
  const recent = visible.slice(0, 8);

  function openNewEntry() {
    window.dispatchEvent(new Event("open-new-entry"));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-gradient-to-br from-brand-800 to-brand-900 p-5 text-white">
        <p className="text-sm text-white/70">Available balance</p>
        <p className={`text-3xl font-bold ${totals.balance < 0 ? "text-red-300" : "text-white"}`}>
          {totals.balance < 0 ? "-" : ""}₹{Math.abs(totals.balance).toFixed(2)}
        </p>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
          <button onClick={openNewEntry} className="flex flex-col items-center gap-1 rounded-xl bg-white/10 py-3">
            <span>↙</span>Received
          </button>
          <button onClick={openNewEntry} className="flex flex-col items-center gap-1 rounded-xl bg-white/10 py-3">
            <span>↗</span>Spent
          </button>
          <Link to="/notes" className="flex flex-col items-center gap-1 rounded-xl bg-white/10 py-3">
            <span>📄</span>Notes
          </Link>
          <Link to="/history" className="flex flex-col items-center gap-1 rounded-xl bg-white/10 py-3">
            <span>🕓</span>History
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
          <p className="text-xs text-slate-400">↙ Received</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">₹{totals.received.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
          <p className="text-xs text-slate-400">↗ Spent</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">₹{totals.spent.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
          <p className="text-xs text-slate-400">Opening float</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">₹0.00</p>
        </div>
        <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
          <p className="text-xs text-slate-400">Entries</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{transactions.length}</p>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">Recent transactions</h2>
          <Link to="/history" className="text-sm font-medium text-brand-600 dark:text-brand-200">
            See all
          </Link>
        </div>

        <div className="mb-3 flex gap-2">
          {(["all", "received", "spent"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${
                filter === f
                  ? "bg-brand-900 text-white"
                  : "bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {recent.length === 0 && (
            <li className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 dark:bg-slate-800">
              No entries yet — tap the + button to add one.
            </li>
          )}
          {recent.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-xl bg-white p-3 dark:bg-slate-800">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  t.type === "spent"
                    ? "bg-red-50 text-red-500 dark:bg-red-950"
                    : "bg-green-50 text-green-500 dark:bg-green-950"
                }`}
              >
                {t.type === "spent" ? "↗" : "↙"}
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-800 dark:text-slate-100">{t.note || "(no note)"}</p>
                <p className="text-xs text-slate-400">{t.date}</p>
              </div>
              <p className={`font-semibold ${t.type === "spent" ? "text-red-500" : "text-green-600"}`}>
                {t.type === "spent" ? "-" : "+"}₹{t.amount.toFixed(2)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {profile && <p className="pt-2 text-center text-xs text-slate-400">Signed in as {profile.name}</p>}
    </div>
  );
}

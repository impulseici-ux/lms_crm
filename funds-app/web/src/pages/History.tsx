import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { Transaction } from "../types";
import { currentMonth, downloadCsv, monthLabel, transactionsToCsv } from "../lib/csv";

export default function History() {
  const { user, profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState(currentMonth());

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

  const monthOptions = useMemo(() => {
    const set = new Set(transactions.map((t) => t.month));
    set.add(currentMonth());
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const filtered = transactions.filter((t) => t.month === month);
  const received = filtered.filter((t) => t.type === "received").reduce((s, t) => s + t.amount, 0);
  const spent = filtered.filter((t) => t.type === "spent").reduce((s, t) => s + t.amount, 0);

  function handleExport() {
    downloadCsv(`${profile?.name ?? "employee"}-${month}.csv`, transactionsToCsv(filtered));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">History</h1>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
          <p className="text-xs text-slate-400">Received</p>
          <p className="text-lg font-bold text-green-600">₹{received.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
          <p className="text-xs text-slate-400">Spent</p>
          <p className="text-lg font-bold text-red-500">₹{spent.toFixed(2)}</p>
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={filtered.length === 0}
        className="w-full rounded-lg border border-brand-600 py-2 text-sm font-semibold text-brand-600 disabled:opacity-40 dark:text-brand-200"
      >
        Export {monthLabel(month)} as CSV
      </button>

      <ul className="space-y-2">
        {filtered.length === 0 && (
          <li className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 dark:bg-slate-800">
            No entries for {monthLabel(month)}.
          </li>
        )}
        {filtered.map((t) => (
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
    </div>
  );
}

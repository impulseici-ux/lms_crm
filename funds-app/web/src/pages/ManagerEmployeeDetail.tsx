import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Transaction, UserProfile } from "../types";
import { currentMonth, downloadCsv, monthLabel, transactionsToCsv } from "../lib/csv";

export default function ManagerEmployeeDetail() {
  const { uid } = useParams<{ uid: string }>();
  const [employee, setEmployee] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid)).then((snap) => {
      if (snap.exists()) setEmployee(snap.data() as UserProfile);
    });
    return onSnapshot(query(collection(db, "transactions"), where("employeeId", "==", uid)), (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, "id">) })));
    });
  }, [uid]);

  const monthOptions = useMemo(() => {
    const set = new Set(transactions.map((t) => t.month));
    set.add(currentMonth());
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => (from || to ? true : t.month === month))
      .filter((t) => (from ? t.date >= from : true))
      .filter((t) => (to ? t.date <= to : true))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [transactions, month, from, to]);

  const received = filtered.filter((t) => t.type === "received").reduce((s, t) => s + t.amount, 0);
  const spent = filtered.filter((t) => t.type === "spent").reduce((s, t) => s + t.amount, 0);
  const balance = received - spent;
  const rangeLabel = from || to ? `${from || "start"} to ${to || "now"}` : monthLabel(month);

  function handleExport() {
    downloadCsv(`${employee?.name ?? uid}-${from || to ? `${from || "start"}_to_${to || "now"}` : month}.csv`, transactionsToCsv(filtered));
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-brand-600 dark:text-brand-200">
        ← Back to dashboard
      </Link>

      <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{employee?.name ?? "…"}</p>
        <p className="text-sm text-slate-400">{employee?.email}</p>
        <p className="mt-2 text-xs text-slate-400">Available balance · {rangeLabel}</p>
        <p className={`text-2xl font-bold ${balance < 0 ? "text-red-500" : "text-green-600"}`}>
          {balance < 0 ? "-" : ""}₹{Math.abs(balance).toFixed(2)}
        </p>
      </div>

      <div className="space-y-2 rounded-xl bg-white p-4 dark:bg-slate-800">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Filter</p>
        <select
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setFrom("");
            setTo("");
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            aria-label="From date"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            aria-label="To date"
          />
        </div>
        <p className="text-xs text-slate-400">Set a custom date range to override the month picker.</p>
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
        Export this view as CSV
      </button>

      <ul className="space-y-2">
        {filtered.length === 0 && (
          <li className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 dark:bg-slate-800">
            No entries in this range.
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

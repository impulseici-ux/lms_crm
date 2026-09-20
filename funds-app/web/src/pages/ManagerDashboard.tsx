import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Transaction, UserProfile } from "../types";
import { currentMonth, downloadCsv, monthLabel, transactionsToCsv } from "../lib/csv";

export default function ManagerDashboard() {
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState<string>(currentMonth());

  useEffect(() => {
    const unsubUsers = onSnapshot(query(collection(db, "users"), where("role", "==", "employee")), (snap) => {
      setEmployees(snap.docs.map((d) => d.data() as UserProfile));
    });
    const unsubTx = onSnapshot(collection(db, "transactions"), (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, "id">) })));
    });
    return () => {
      unsubUsers();
      unsubTx();
    };
  }, []);

  const monthOptions = useMemo(() => {
    const set = new Set(transactions.map((t) => t.month));
    set.add(currentMonth());
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const monthTx = transactions.filter((t) => t.month === month);

  const perEmployee = useMemo(() => {
    return employees.map((emp) => {
      const all = transactions.filter((t) => t.employeeId === emp.uid);
      const monthly = monthTx.filter((t) => t.employeeId === emp.uid);
      const received = all.filter((t) => t.type === "received").reduce((s, t) => s + t.amount, 0);
      const spent = all.filter((t) => t.type === "spent").reduce((s, t) => s + t.amount, 0);
      return {
        emp,
        balance: received - spent,
        monthReceived: monthly.filter((t) => t.type === "received").reduce((s, t) => s + t.amount, 0),
        monthSpent: monthly.filter((t) => t.type === "spent").reduce((s, t) => s + t.amount, 0),
        entries: monthly.length,
      };
    });
  }, [employees, transactions, monthTx]);

  const totals = useMemo(
    () => ({
      received: monthTx.filter((t) => t.type === "received").reduce((s, t) => s + t.amount, 0),
      spent: monthTx.filter((t) => t.type === "spent").reduce((s, t) => s + t.amount, 0),
    }),
    [monthTx]
  );

  function exportConsolidated() {
    downloadCsv(`all-employees-${month}.csv`, transactionsToCsv(monthTx, true));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
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
          <p className="text-xs text-slate-400">Received ({monthLabel(month)})</p>
          <p className="text-lg font-bold text-green-600">₹{totals.received.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 dark:bg-slate-800">
          <p className="text-xs text-slate-400">Spent ({monthLabel(month)})</p>
          <p className="text-lg font-bold text-red-500">₹{totals.spent.toFixed(2)}</p>
        </div>
      </div>

      <button
        onClick={exportConsolidated}
        disabled={monthTx.length === 0}
        className="w-full rounded-lg border border-brand-600 py-2 text-sm font-semibold text-brand-600 disabled:opacity-40 dark:text-brand-200"
      >
        Export consolidated {monthLabel(month)} report (all employees)
      </button>

      <div className="flex items-center justify-between pt-2">
        <h2 className="font-bold text-slate-800 dark:text-slate-100">Employees</h2>
        <Link to="/employees" className="text-sm font-medium text-brand-600 dark:text-brand-200">
          Manage employees
        </Link>
      </div>

      <ul className="space-y-2">
        {perEmployee.length === 0 && (
          <li className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 dark:bg-slate-800">
            No employees yet. Add one from "Manage employees".
          </li>
        )}
        {perEmployee.map(({ emp, balance, monthReceived, monthSpent, entries }) => (
          <li key={emp.uid}>
            <Link
              to={`/employees/${emp.uid}`}
              className="flex items-center gap-3 rounded-xl bg-white p-3 dark:bg-slate-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-100">
                {emp.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-800 dark:text-slate-100">{emp.name}</p>
                <p className="text-xs text-slate-400">
                  {entries} entries this month · +₹{monthReceived.toFixed(0)} / -₹{monthSpent.toFixed(0)}
                </p>
              </div>
              <p className={`font-semibold ${balance < 0 ? "text-red-500" : "text-green-600"}`}>
                {balance < 0 ? "-" : ""}₹{Math.abs(balance).toFixed(2)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

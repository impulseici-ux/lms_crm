import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { Transaction } from "../types";

export default function Notes() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

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

  const withNotes = transactions.filter((t) => t.note.trim().length > 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Notes</h1>
      <p className="text-sm text-slate-400">
        Notes you've attached to your entries. Everyone with manager access can see these.
      </p>

      <ul className="space-y-2">
        {withNotes.length === 0 && (
          <li className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 dark:bg-slate-800">
            No notes yet.
          </li>
        )}
        {withNotes.map((t) => (
          <li key={t.id} className="rounded-xl bg-white p-4 dark:bg-slate-800">
            <div className="mb-1 flex items-center justify-between">
              <span
                className={`text-xs font-semibold uppercase ${
                  t.type === "spent" ? "text-red-500" : "text-green-600"
                }`}
              >
                {t.type} · ₹{t.amount.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400">{t.date}</span>
            </div>
            <p className="text-slate-700 dark:text-slate-200">{t.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useEffect, useState } from "react";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { Reminder } from "../types";

function isDueToday(reminder: Reminder, todayStr: string, currentMonthStr: string): boolean {
  if (reminder.dueDate > todayStr) return false;
  if (reminder.repeat === "once") return !reminder.completed;
  return reminder.lastCompletedFor !== currentMonthStr;
}

export default function DueReminderGate() {
  const { user } = useAuth();
  const [due, setDue] = useState<Reminder[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!user) return;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const currentMonthStr = todayStr.slice(0, 7);

    (async () => {
      const snap = await getDocs(query(collection(db, "reminders"), where("employeeId", "==", user.uid)));
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reminder, "id">) }));
      setDue(all.filter((r) => isDueToday(r, todayStr, currentMonthStr)));
    })();
  }, [user]);

  if (due.length === 0 || index >= due.length) return null;
  const reminder = due[index];

  async function handleDone() {
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    await updateDoc(doc(db, "reminders", reminder.id), reminder.repeat === "monthly"
      ? { lastCompletedFor: currentMonthStr }
      : { completed: true }
    );
    setIndex((i) => i + 1);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-slate-800">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-200">
          {reminder.kind === "pay" ? "Payment due" : "Payment expected"}
        </div>
        <h2 className="mb-1 text-lg font-bold text-brand-900 dark:text-white">{reminder.title}</h2>
        {reminder.amount != null && (
          <p className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">₹{reminder.amount.toFixed(2)}</p>
        )}
        {reminder.note && <p className="mb-4 text-sm text-slate-500 dark:text-slate-300">{reminder.note}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => setIndex((i) => i + 1)}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-200"
          >
            Later
          </button>
          <button
            onClick={handleDone}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 font-semibold text-white"
          >
            Mark done
          </button>
        </div>
      </div>
    </div>
  );
}

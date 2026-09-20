import { useEffect, useState, type FormEvent } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { Reminder, ReminderKind, ReminderRepeat } from "../types";

export default function Reminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ReminderKind>("pay");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [repeat, setRepeat] = useState<ReminderRepeat>("once");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "reminders"),
      where("employeeId", "==", user.uid),
      orderBy("dueDate", "asc")
    );
    return onSnapshot(q, (snap) => {
      setReminders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reminder, "id">) })));
    });
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !title.trim()) return;
    await addDoc(collection(db, "reminders"), {
      employeeId: user.uid,
      title: title.trim(),
      kind,
      amount: amount ? Number(amount) : null,
      dueDate,
      repeat,
      note: note.trim(),
      completed: false,
    });
    setTitle("");
    setAmount("");
    setNote("");
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, "reminders", id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Reminders</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
        >
          {showForm ? "Close" : "+ New"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-4 dark:bg-slate-800">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Pay site electrician"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ReminderKind)}
              className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="pay">I need to pay</option>
              <option value="receive">I expect to receive</option>
            </select>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}
              className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="once">One-time</option>
              <option value="monthly">Every month</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
          <button type="submit" className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white">
            Save reminder
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {reminders.length === 0 && (
          <li className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 dark:bg-slate-800">
            No reminders set. They'll pop up automatically on their due date.
          </li>
        )}
        {reminders.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-xl bg-white p-3 dark:bg-slate-800">
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
              <p className="text-xs text-slate-400">
                {r.kind === "pay" ? "Pay" : "Receive"} · Due {r.dueDate}
                {r.repeat === "monthly" ? " · every month" : ""}
                {r.amount != null ? ` · ₹${r.amount.toFixed(2)}` : ""}
              </p>
            </div>
            <button onClick={() => handleDelete(r.id)} className="text-sm text-red-500">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { TransactionType } from "../types";

export default function NewEntryModal({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const [type, setType] = useState<TransactionType>("spent");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, "transactions"), {
        employeeId: user.uid,
        employeeName: profile.name,
        type,
        amount: numericAmount,
        date,
        month: date.slice(0, 7),
        note: note.trim(),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch {
      setError("Couldn't save this entry. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-2xl bg-white p-6 dark:bg-slate-800"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
        <h2 className="mb-4 text-xl font-bold text-brand-900 dark:text-white">New entry</h2>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setType("received")}
            className={`flex flex-col items-center gap-1 rounded-xl border py-3 font-semibold ${
              type === "received"
                ? "border-green-400 bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300"
                : "border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-300"
            }`}
          >
            ↙ Received
          </button>
          <button
            type="button"
            onClick={() => setType("spent")}
            className={`flex flex-col items-center gap-1 rounded-xl border py-3 font-semibold ${
              type === "spent"
                ? "border-red-300 bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300"
                : "border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-300"
            }`}
          >
            ↗ Spent
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Amount (₹)
        </label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Notes — what was this for?
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Site materials — cement, 20 bags"
          rows={3}
          className="mb-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        />
        <p className="mb-4 text-xs text-slate-400">Your manager can see this note.</p>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Add entry"}
          </button>
        </div>
      </form>
    </div>
  );
}

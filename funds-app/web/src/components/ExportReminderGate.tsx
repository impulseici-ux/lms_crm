import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { Transaction } from "../types";
import { downloadCsv, monthLabel, previousMonth, shareOrDownloadCsv, transactionsToCsv } from "../lib/csv";

const REMINDER_WINDOW_DAYS = 10; // show for the first N days of the new month

export default function ExportReminderGate() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [busy, setBusy] = useState(false);
  const prevMonth = previousMonth();

  useEffect(() => {
    if (!user) return;
    const dayOfMonth = new Date().getDate();
    if (dayOfMonth > REMINDER_WINDOW_DAYS) return;

    let cancelled = false;
    (async () => {
      const recordRef = doc(db, "monthlyExports", `${user.uid}_${prevMonth}`);
      const record = await getDoc(recordRef);
      if (record.exists() && record.data().exported) return;

      const txSnap = await getDocs(
        query(
          collection(db, "transactions"),
          where("employeeId", "==", user.uid),
          where("month", "==", prevMonth)
        )
      );
      if (txSnap.empty || cancelled) return;

      setTransactions(
        txSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, "id">) }))
      );
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, prevMonth]);

  if (!open || !user || !profile) return null;

  async function markExported() {
    setBusy(true);
    try {
      await setDoc(
        doc(db, "monthlyExports", `${user!.uid}_${prevMonth}`),
        { employeeId: user!.uid, month: prevMonth, exported: true, exportedAt: serverTimestamp() },
        { merge: true }
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    downloadCsv(`${profile!.name}-${prevMonth}.csv`, transactionsToCsv(transactions));
    await markExported();
  }

  async function handleShare() {
    await shareOrDownloadCsv(`${profile!.name}-${prevMonth}.csv`, transactionsToCsv(transactions));
    await markExported();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center dark:bg-slate-800">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-100">
          📄
        </div>
        <h2 className="mb-1 text-lg font-bold text-brand-900 dark:text-white">
          Export {monthLabel(prevMonth)}
        </h2>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-300">
          A new month has started. Download or share last month's {transactions.length} entr
          {transactions.length === 1 ? "y" : "ies"} before it gets buried in history.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownload}
            disabled={busy}
            className="rounded-lg bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            Download CSV
          </button>
          <button
            onClick={handleShare}
            disabled={busy}
            className="rounded-lg border border-brand-600 py-2.5 font-semibold text-brand-600 dark:text-brand-200 disabled:opacity-60"
          >
            Share
          </button>
          <button
            onClick={() => setOpen(false)}
            disabled={busy}
            className="py-2 text-sm text-slate-400"
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}

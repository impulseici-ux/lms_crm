import { onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { syncConfigDoc, syncRunsCol } from "@/lib/data/collections";
import type { SyncConfigDoc, SyncRunDoc } from "@/types";

/** Read-only: the sync script (Admin SDK) is the only writer of these documents. */
export function subscribeSyncConfig(onChange: (config: SyncConfigDoc | null) => void) {
  return onSnapshot(syncConfigDoc(), (snap) => {
    onChange(snap.exists() ? ({ ...(snap.data() as Omit<SyncConfigDoc, "id">) } as SyncConfigDoc) : null);
  });
}

export function subscribeSyncRuns(onChange: (runs: SyncRunDoc[]) => void, count = 10) {
  const q = query(syncRunsCol(), orderBy("startedAt", "desc"), limit(count));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SyncRunDoc, "id">) })));
  });
}

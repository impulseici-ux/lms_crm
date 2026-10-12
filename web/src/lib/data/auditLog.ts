import { query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { auditLogCol } from "@/lib/data/collections";
import type { AuditLogDoc } from "@/types";

/** Live feed of the most recent audit entries (Admin > Audit Log, superadmin-only). */
export function subscribeAuditLog(onChange: (entries: AuditLogDoc[]) => void) {
  const q = query(auditLogCol(), orderBy("at", "desc"), limit(300));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogDoc, "id">) })));
  });
}

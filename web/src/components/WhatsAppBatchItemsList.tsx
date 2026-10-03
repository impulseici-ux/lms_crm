import { useState } from "react";
import { Button, Badge } from "@/components/ui";
import { transitionBatchItem } from "@/lib/data/whatsappBatches";
import type { WhatsAppBatchItemDoc, WhatsAppBatchItemStatus } from "@/types/whatsapp";

const FAILURE_REASONS = ["Invalid WhatsApp", "Number not available", "User blocked", "Technical issue", "Other"];

const STATUS_TONE: Record<WhatsAppBatchItemStatus, "accent" | "good" | "warn" | "bad" | "neutral"> = {
  QUEUED: "neutral",
  OPENED: "warn",
  MANUALLY_SENT: "good",
  FAILED: "bad",
  SKIPPED: "neutral",
  CANCELLED: "neutral",
};

const STATUS_LABEL: Record<WhatsAppBatchItemStatus, string> = {
  QUEUED: "Queued",
  OPENED: "Opened — awaiting confirmation",
  MANUALLY_SENT: "Manually Sent",
  FAILED: "Failed",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
};

/** Section 11 — the one place "Mark as Sent" / "Failed" lives, shared by the batch
 * composer's live run and the Batch Details / Retry view, so confirming a send always
 * behaves and looks the same regardless of where staff does it from. */
export function WhatsAppBatchItemsList({
  batchId,
  items,
  currentItemId,
}: {
  batchId: string;
  items: WhatsAppBatchItemDoc[];
  currentItemId?: string | null;
}) {
  const [failingId, setFailingId] = useState<string | null>(null);
  const [reason, setReason] = useState(FAILURE_REASONS[0]);

  const markSent = (itemId: string) => {
    transitionBatchItem(batchId, itemId, "MANUALLY_SENT", { markCompleted: true });
  };
  const confirmFailed = (itemId: string) => {
    transitionBatchItem(batchId, itemId, "FAILED", { reason, markCompleted: true });
    setFailingId(null);
    setReason(FAILURE_REASONS[0]);
  };

  return (
    <div className="rounded-xl border border-border-soft divide-y divide-border-soft max-h-72 overflow-y-auto">
      {items.map((item) => (
        <div key={item.id} className={`px-3.5 py-2.5 text-sm ${item.id === currentItemId ? "bg-accent-soft/40" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">
              {item.leadParentName} · {item.leadChildName}
            </span>
            <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
          </div>
          {item.reason && (item.status === "FAILED" || item.status === "SKIPPED") && (
            <div className="text-xs text-bad mt-1">{item.reason}</div>
          )}

          {item.status === "OPENED" && failingId !== item.id && (
            <div className="flex items-center gap-2 mt-2">
              <Button size="sm" onClick={() => markSent(item.id)}>
                Mark as Sent
              </Button>
              <Button size="sm" variant="subtle" onClick={() => setFailingId(item.id)}>
                Failed
              </Button>
            </div>
          )}
          {failingId === item.id && (
            <div className="flex items-center gap-2 mt-2">
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px]"
              >
                {FAILURE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="danger" onClick={() => confirmFailed(item.id)}>
                Confirm
              </Button>
              <button type="button" onClick={() => setFailingId(null)} className="text-xs text-ink-faint hover:text-ink">
                Cancel
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

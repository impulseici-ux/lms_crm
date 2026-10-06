import { useRef, useState } from "react";
import { transitionBatchItem } from "@/lib/data/whatsappBatches";

// ---------------------------------------------------------------------------
// The one place that knows how to drive a sequence of leads through
// Click-to-Chat — used both by a fresh batch (BulkSendWhatsAppModal) and by
// "Retry Failed" (a batch's own detail view), so the pause/resume/stop and
// delay logic exists exactly once. Neither caller talks to window.open or the
// per-lead Firestore transition directly.
//
// IMPORTANT API LIMITATION (Section 26): api.whatsapp.com/send only opens/
// prepares a chat with the text pre-filled — it has no callback, webhook, or
// polling endpoint that confirms the message was actually sent, delivered, or
// read, and it cannot attach a file. This module must never report anything
// stronger than "opened" for a lead it has processed; "MANUALLY_SENT" is only
// ever set by a human clicking "Mark as Sent" elsewhere, never by this queue.
// When a real provider (Meta Cloud API) is wired in, it replaces this file's
// window.open() call with a real API send that DOES get a confirmed status —
// nothing else in the batch system (creation, personalization, Firestore
// schema, history/retry UI) needs to change.
// ---------------------------------------------------------------------------

export interface ClickToChatQueueItem {
  itemId: string; // batch item doc id, == leadId
  mobile: string; // normalized, e.g. "+919841234567"
  renderedMessage: string; // fully resolved — no {{tokens}} left in it
}

export function buildClickToChatUrl(mobile: string, message: string): string {
  const digits = mobile.replace(/[^0-9]/g, "");
  return `https://api.whatsapp.com/send/?phone=${digits}&text=${encodeURIComponent(message)}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function useClickToChatQueue(delaySeconds: number) {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pausedRef = useRef(false);
  const stopRef = useRef(false);
  const runningRef = useRef(false); // Section 19 — belt-and-braces against a double Start click

  const waitWhilePaused = async () => {
    while (pausedRef.current && !stopRef.current) await sleep(200);
  };

  const delayWithControl = async (totalMs: number) => {
    const step = 500;
    let elapsed = 0;
    while (elapsed < totalMs) {
      if (stopRef.current) return;
      await waitWhilePaused();
      if (stopRef.current) return;
      await sleep(step);
      elapsed += step;
      setCountdown(Math.max(0, Math.ceil((totalMs - elapsed) / 1000)));
    }
  };

  /** Processes `items` sequentially against `batchId`. `batchId` is taken as a parameter
   * here (not captured from an outer hook argument) deliberately — a caller that creates
   * the batch and immediately starts the queue in the same handler would otherwise close
   * over a stale value from the render that ran before its own setBatchId(id) took effect. */
  const start = async (batchId: string, items: ClickToChatQueueItem[]): Promise<{ stopped: boolean }> => {
    if (runningRef.current) return { stopped: false };
    runningRef.current = true;
    setRunning(true);
    setPaused(false);
    pausedRef.current = false;
    stopRef.current = false;

    for (let i = 0; i < items.length; i++) {
      await waitWhilePaused();
      if (stopRef.current) break;

      const item = items[i];
      setCurrentItemId(item.itemId);
      window.open(buildClickToChatUrl(item.mobile, item.renderedMessage), "_blank", "noreferrer");
      await transitionBatchItem(batchId, item.itemId, "OPENED", { markStarted: true });

      if (i < items.length - 1) {
        await delayWithControl(delaySeconds * 1000);
        if (stopRef.current) break;
      }
    }

    const stopped = stopRef.current;
    setRunning(false);
    setCountdown(0);
    setCurrentItemId(null);
    runningRef.current = false;
    return { stopped };
  };

  const pause = () => {
    pausedRef.current = true;
    setPaused(true);
  };
  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
  };
  const stop = () => {
    stopRef.current = true;
    pausedRef.current = false;
    setPaused(false);
  };

  return { running, paused, currentItemId, countdown, start, pause, resume, stop };
}

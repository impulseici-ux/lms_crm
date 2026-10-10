import { useEffect } from "react";
import { LeadProfile } from "@/pages/LeadProfile";

/**
 * Right-side (full-screen on mobile) panel showing the real Lead Profile page —
 * the exact same editing, Pipeline stepper, visit/admission entry, WhatsApp
 * panel and activity timeline as the standalone /leads/:id route — without
 * navigating away from the Enquiries list behind it. LeadProfile itself knows
 * how to render in this "embedded" mode (see its `onClose` prop): the Back
 * link becomes a Close button and its outer max-width wrapper is dropped so it
 * fills this panel instead.
 */
export function LeadDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[640px] lg:w-[760px] xl:w-[860px] h-full bg-bg shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
          <LeadProfile leadId={leadId} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

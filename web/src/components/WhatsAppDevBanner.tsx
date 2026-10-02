import { AlertTriangle } from "lucide-react";

/** Section 2/30 — shown everywhere a WhatsApp action or status is visible, so staff never mistake a simulated send for a real one. */
export function WhatsAppDevBanner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn ${className}`}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>
        <strong className="font-semibold">WhatsApp API is not connected.</strong> Automation is currently running in Development
        Mode — messages are <strong className="font-semibold">simulated</strong>, never actually sent.
      </span>
    </div>
  );
}

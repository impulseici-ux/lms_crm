import { useEffect, type ReactNode, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { X, Phone, MessageCircle, ArrowUpRight, Mail, MapPin, Radio, BookOpen, IndianRupee, UserCog, CalendarClock, ShieldAlert } from "lucide-react";
import { StatusPill, PriorityPill, FollowUpPill } from "@/components/Pills";
import { isValidLeadPhone } from "@/utils/phone";
import { buildWhatsAppLink } from "@/utils/whatsapp";
import type { LeadDoc } from "@/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/**
 * Right-side (full-screen on mobile) quick-look panel opened by clicking a lead
 * row/card — keeps the list in view instead of navigating away. Deliberately a
 * READ-ONLY summary plus quick actions, not a reimplementation of the full
 * LeadProfile page (editing, the activity timeline, WhatsApp history, visit/
 * admission data entry) — "Open Full Profile" below is the way into all of that,
 * so this stays a lightweight companion rather than a second copy to keep in sync.
 */
export function LeadDrawer({
  lead,
  onClose,
  programName,
  branchName,
  staffName,
}: {
  lead: LeadDoc;
  onClose: () => void;
  programName: (id: string | null) => string;
  branchName: (id: string | null) => string;
  staffName: (id: string | null) => string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const waLink = buildWhatsAppLink(lead.parentPhone, lead.parentName, lead.sourceChannel);
  const validPhone = isValidLeadPhone(lead.parentPhone);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[420px] h-full bg-surface shadow-2xl flex flex-col animate-slide-in-right">
        <div className="shrink-0 flex items-start gap-3 px-4 py-3.5 border-b border-border-soft">
          <div className="w-10 h-10 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center text-[13px] font-bold shrink-0">
            {initials(lead.childName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] font-semibold text-ink truncate">{lead.childName}</div>
            <div className="text-xs text-ink-faint truncate">Parent/guardian: {lead.parentName}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <StatusPill status={lead.status} />
              <PriorityPill priority={lead.priority} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="shrink-0 grid grid-cols-3 gap-2 px-4 py-3 border-b border-border-soft">
          {validPhone ? (
            <a href={`tel:${lead.parentPhone}`} className="flex flex-col items-center gap-1 rounded-xl border border-border py-2.5 text-ink-soft hover:bg-surface-2 hover:text-accent">
              <Phone className="w-4 h-4" /> <span className="text-[11px] font-semibold">Call</span>
            </a>
          ) : (
            <span className="flex flex-col items-center gap-1 rounded-xl border border-border-soft py-2.5 text-ink-faint/40">
              <Phone className="w-4 h-4" /> <span className="text-[11px] font-semibold">Call</span>
            </span>
          )}
          {waLink ? (
            <a href={waLink} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl border border-border py-2.5 text-ink-soft hover:bg-good-soft hover:text-good">
              <MessageCircle className="w-4 h-4" /> <span className="text-[11px] font-semibold">WhatsApp</span>
            </a>
          ) : (
            <span className="flex flex-col items-center gap-1 rounded-xl border border-border-soft py-2.5 text-ink-faint/40">
              <MessageCircle className="w-4 h-4" /> <span className="text-[11px] font-semibold">WhatsApp</span>
            </span>
          )}
          <Link to={`/leads/${lead.id}`} className="flex flex-col items-center gap-1 rounded-xl border border-accent/30 bg-accent-soft py-2.5 text-accent-strong hover:bg-accent/15">
            <ArrowUpRight className="w-4 h-4" /> <span className="text-[11px] font-semibold">Full Profile</span>
          </Link>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 space-y-3.5">
          <FactRow icon={Phone} label="Mobile" value={validPhone ? lead.parentPhone : <span className="text-warn inline-flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" />Invalid number</span>} />
          <FactRow icon={Mail} label="Email" value={lead.parentEmail ?? "—"} />
          <FactRow icon={CalendarClock} label="Follow-up" value={<FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} />} />
          <FactRow icon={BookOpen} label="Course" value={programName(lead.interestedProgramId)} />
          <FactRow icon={IndianRupee} label="Fees quoted" value={lead.fees != null ? `₹${lead.fees.toLocaleString("en-IN")}` : "—"} />
          <FactRow icon={Radio} label="Source" value={lead.sourceChannel} />
          <FactRow icon={MapPin} label="Location" value={lead.location ?? "—"} />
          {lead.branchId && <FactRow icon={MapPin} label="Branch" value={branchName(lead.branchId)} />}
          <FactRow icon={UserCog} label="Assigned to" value={staffName(lead.assignedStaffId)} />
          {lead.notes && (
            <div className="pt-1">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Remarks</div>
              <p className="text-sm text-ink-soft whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 py-3 border-t border-border-soft">
          <Link to={`/leads/${lead.id}`} className="block w-full text-center rounded-xl bg-accent text-white font-semibold text-sm py-2.5 hover:bg-accent-strong transition-colors">
            Open Full Profile — edit, timeline &amp; more
          </Link>
        </div>
      </div>
    </div>
  );
}

function FactRow({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-ink-faint mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="font-medium text-ink text-sm truncate">{value}</div>
      </div>
    </div>
  );
}

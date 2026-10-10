import { useEffect } from "react";
import { Link } from "react-router-dom";
import { X, Phone, MessageCircle, ArrowUpRight, Mail, MapPin, Radio, BookOpen, IndianRupee, UserCog, CalendarClock, ShieldAlert } from "lucide-react";
import { StatusPill, PriorityPill, FollowUpPill } from "@/components/Pills";
import { isValidLeadPhone } from "@/utils/phone";
import { buildWhatsAppLink } from "@/utils/whatsapp";
import type { LeadDoc } from "@/types";
import type { ReactNode, ComponentType } from "react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Compact right-side (full-width on mobile) quick-look panel opened by clicking
 * a lead row/card — keeps the list in view instead of navigating away.
 * Deliberately a READ-ONLY summary plus quick actions, not a reimplementation of
 * the full LeadProfile page (editing, the activity timeline, reassignment,
 * WhatsApp history, visit/admission data entry) — the sticky "Open Full Profile"
 * button below is the way into all of that, so this stays a lightweight
 * companion instead of a second copy of that page to keep in sync.
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
  const namesDiffer = !sameName(lead.parentName, lead.childName);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[520px] h-full bg-surface shadow-2xl flex flex-col animate-slide-in-right">
        {/* Compact header */}
        <div className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-border-soft">
          <div className="w-10 h-10 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center text-[13px] font-bold shrink-0">
            {initials(lead.parentName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16px] font-semibold text-ink truncate">{lead.parentName}</div>
            {namesDiffer && <div className="text-xs text-ink-faint truncate">{lead.childName}</div>}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <StatusPill status={lead.status} />
              <PriorityPill priority={lead.priority} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="shrink-0 grid grid-cols-3 gap-2 px-4 py-2.5 border-b border-border-soft">
          {validPhone ? (
            <a href={`tel:${lead.parentPhone}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-border h-10 text-ink-soft hover:bg-surface-2 hover:text-accent text-[13px] font-semibold">
              <Phone className="w-4 h-4" /> Call
            </a>
          ) : (
            <span className="flex items-center justify-center gap-1.5 rounded-lg border border-border-soft h-10 text-ink-faint/40 text-[13px] font-semibold">
              <Phone className="w-4 h-4" /> Call
            </span>
          )}
          {waLink ? (
            <a href={waLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-border h-10 text-ink-soft hover:bg-good-soft hover:text-good text-[13px] font-semibold">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          ) : (
            <span className="flex items-center justify-center gap-1.5 rounded-lg border border-border-soft h-10 text-ink-faint/40 text-[13px] font-semibold">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </span>
          )}
          <Link to={`/leads/${lead.id}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-border h-10 text-ink-soft hover:bg-surface-2 hover:text-accent text-[13px] font-semibold">
            <CalendarClock className="w-4 h-4" /> Follow-up
          </Link>
        </div>

        {/* Compact info list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pb-24">
          <InfoRow icon={Phone} label="Mobile" value={validPhone ? lead.parentPhone : <span className="text-warn inline-flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" />Invalid number</span>} />
          <InfoRow icon={Mail} label="Email" value={lead.parentEmail ?? "—"} />
          <InfoRow icon={CalendarClock} label="Follow-up" value={<FollowUpPill nextFollowUpAt={lead.nextFollowUpAt} />} />
          <InfoRow icon={BookOpen} label="Course" value={programName(lead.interestedProgramId)} />
          <InfoRow icon={IndianRupee} label="Fees quoted" value={lead.fees != null ? `₹${lead.fees.toLocaleString("en-IN")}` : "—"} />
          <InfoRow icon={Radio} label="Source" value={lead.sourceChannel} />
          <InfoRow icon={MapPin} label="Location" value={lead.location ?? "—"} />
          {lead.branchId && <InfoRow icon={MapPin} label="Branch" value={branchName(lead.branchId)} />}
          <InfoRow icon={UserCog} label="Assigned to" value={staffName(lead.assignedStaffId)} />
          <InfoRow icon={ArrowUpRight} label="Remarks" value={lead.notes ?? "—"} last />
        </div>

        {/* Sticky bottom action */}
        <div className="shrink-0 px-4 py-3 border-t border-border-soft bg-surface">
          <Link to={`/leads/${lead.id}`} className="block w-full text-center rounded-xl bg-accent text-white font-semibold text-sm py-2.5 hover:bg-accent-strong transition-colors">
            Open Full Profile — Edit, Timeline &amp; More
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, last }: { icon: ComponentType<{ className?: string }>; label: string; value: ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 py-1.5 ${last ? "" : "border-b border-border-soft/60"}`}>
      <Icon className="w-4 h-4 text-ink-faint mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="font-medium text-ink text-[13.5px] truncate">{value}</div>
      </div>
    </div>
  );
}

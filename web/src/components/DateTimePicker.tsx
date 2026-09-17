import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Button } from "@/components/ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Same shape as a native `datetime-local` input's value: "YYYY-MM-DDTHH:mm", local time. */
function toInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputValue(value: string): Date {
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0);
}

function formatDisplay(d: Date): string {
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Replaces the native `datetime-local` input, which commits a value the
 * instant a day/time is picked with no way to review or cancel. This shows
 * the same calendar grid + time selection but only commits on an explicit
 * "Done" (or discards on "Cancel"/outside-click).
 */
export function DateTimePicker({
  value,
  onChange,
  required,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => (value ? fromInputValue(value) : new Date()));
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(draft));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // `Field` (the usual wrapper) renders a <label>. A <label> with several
  // buttons inside it forwards any click to the *first* labelable descendant
  // (our trigger button) as a browser default action — without this, closing
  // via Cancel/Done or picking a day would immediately re-trigger openPicker()
  // and undo itself. preventDefault() on every internal click suppresses that.
  const openPicker = (e: ReactMouseEvent) => {
    e.preventDefault();
    const base = value ? fromInputValue(value) : new Date();
    setDraft(base);
    setViewMonth(startOfMonth(base));
    setOpen(true);
  };

  const commit = (e: ReactMouseEvent) => {
    e.preventDefault();
    onChange(toInputValue(draft));
    setOpen(false);
  };

  const firstWeekday = startOfMonth(viewMonth).getDay();
  const totalDays = daysInMonth(viewMonth);
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={openPicker}
        className="w-full flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14.5px] text-left shadow-[var(--shadow-card)] transition-colors focus:outline-none focus:ring-[3px] focus:ring-accent/15 focus:border-accent hover:border-ink-faint/40"
      >
        <CalendarDays className="w-4 h-4 text-ink-faint shrink-0" />
        <span className={value ? "text-ink" : "text-ink-faint"}>{value ? formatDisplay(fromInputValue(value)) : "Select date & time"}</span>
      </button>
      {required && <input type="text" required value={value} readOnly tabIndex={-1} aria-hidden className="sr-only" />}

      {open && (
        <div className="absolute z-50 mt-1.5 w-[300px] bg-surface border border-border rounded-2xl shadow-elevated p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              aria-label="Previous month"
              onClick={(e) => { e.preventDefault(); setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-ink">{viewMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={(e) => { e.preventDefault(); setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] font-semibold uppercase text-ink-faint py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 mb-3">
            {cells.map((day, i) => {
              if (day == null) return <div key={i} />;
              const cellDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
              const selected = sameDay(cellDate, draft);
              const isToday = sameDay(cellDate, new Date());
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setDraft((d) => new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate(), d.getHours(), d.getMinutes()));
                  }}
                  className={`h-8 rounded-lg text-[13px] font-medium transition-colors ${
                    selected
                      ? "bg-accent text-white"
                      : isToday
                      ? "bg-accent-soft text-accent-strong"
                      : "text-ink hover:bg-surface-2"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft pt-3">
            <label className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold shrink-0">Time</label>
            <input
              type="time"
              value={`${pad(draft.getHours())}:${pad(draft.getMinutes())}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                setDraft((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h ?? 0, m ?? 0));
              }}
              className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3.5 pt-3 border-t border-border-soft">
            <Button type="button" size="sm" variant="secondary" onClick={(e) => { e.preventDefault(); setOpen(false); }}>Cancel</Button>
            <Button type="button" size="sm" onClick={commit}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}

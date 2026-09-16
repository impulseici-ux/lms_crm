import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Card({
  children,
  className = "",
  id,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  padded?: boolean;
}) {
  return (
    <div
      id={id}
      className={`bg-surface border border-border rounded-2xl shadow-[var(--shadow-card)] ${padded ? "p-5 sm:p-6" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent mb-1.5">{eyebrow}</div>
        )}
        <h1 className="font-display text-[26px] sm:text-[28px] font-semibold leading-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-ink-soft mt-1.5 max-w-xl">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block mb-4">
      <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-faint mt-1.5 leading-relaxed">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14.5px] text-ink placeholder:text-ink-faint shadow-[var(--shadow-card)] transition-colors focus:outline-none focus:ring-[3px] focus:ring-accent/15 focus:border-accent disabled:bg-surface-2 disabled:text-ink-faint";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%238D97A8%22><path d=%22M5.5 7.5l4.5 4.5 4.5-4.5%22 stroke=%22%238D97A8%22 stroke-width=%221.5%22 fill=%22none%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/></svg>')] bg-no-repeat bg-[right_0.75rem_center] pr-9 ${props.className ?? ""}`} />;
}

export function LabelText(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} />;
}

const buttonVariants: Record<string, string> = {
  primary: "bg-accent text-white shadow-[var(--shadow-card)] hover:bg-accent-strong",
  secondary: "bg-surface text-ink border border-border hover:bg-surface-2 hover:border-ink-faint/40",
  danger: "bg-bad text-white hover:opacity-90",
  ghost: "text-accent hover:bg-accent-soft",
  subtle: "bg-surface-2 text-ink-soft hover:bg-surface-hover hover:text-ink",
};

const buttonSizes: Record<string, string> = {
  sm: "px-3 py-1.5 text-[13px] rounded-lg gap-1.5",
  md: "px-4 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-5 py-3 text-[15px] rounded-xl gap-2",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "subtle";
  size?: "sm" | "md" | "lg";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  variant = "secondary",
  className = "",
  "aria-label": ariaLabel,
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  "aria-label": string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<string, string> = {
    primary: "bg-accent text-white hover:bg-accent-strong",
    secondary: "bg-surface border border-border text-ink-soft hover:bg-surface-2 hover:text-ink",
    ghost: "text-ink-soft hover:bg-surface-2 hover:text-ink",
  };
  return (
    <button
      {...rest}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors active:scale-[0.96] ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

const badgeTones: Record<string, string> = {
  accent: "bg-accent-soft text-accent-strong",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-surface-2 text-ink-soft",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
  className = "",
}: {
  children: ReactNode;
  tone?: "accent" | "good" | "warn" | "bad" | "neutral";
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${badgeTones[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function IconTile({
  children,
  tone = "accent",
  size = "md",
}: {
  children: ReactNode;
  tone?: "accent" | "good" | "warn" | "bad" | "neutral";
  size?: "sm" | "md" | "lg";
}) {
  const tones: Record<string, string> = {
    accent: "bg-accent-soft text-accent",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    neutral: "bg-surface-2 text-ink-soft",
  };
  const sizes: Record<string, string> = { sm: "w-8 h-8 rounded-lg [&>svg]:w-4 [&>svg]:h-4", md: "w-10 h-10 rounded-xl [&>svg]:w-5 [&>svg]:h-5", lg: "w-12 h-12 rounded-xl [&>svg]:w-6 [&>svg]:h-6" };
  return <div className={`flex items-center justify-center shrink-0 ${tones[tone]} ${sizes[size]}`}>{children}</div>;
}

export function BigStat({
  value,
  label,
  color,
  icon,
  trend,
}: {
  value: string | number;
  label: string;
  color?: string;
  icon?: ReactNode;
  trend?: string;
}) {
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[28px] leading-none font-semibold" style={color ? { color } : undefined}>
            {value}
          </div>
          <div className="text-[13px] text-ink-soft mt-2 truncate">{label}</div>
        </div>
        {icon && (
          <div className="shrink-0 w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-ink-faint [&>svg]:w-[18px] [&>svg]:h-[18px]" style={color ? { color, backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)" } : undefined}>
            {icon}
          </div>
        )}
      </div>
      {trend && <div className="text-[11px] text-ink-faint mt-2">{trend}</div>}
    </Card>
  );
}

export function ProgressBar({
  value,
  tone = "accent",
  className = "",
}: {
  value: number;
  tone?: "accent" | "good" | "warn" | "bad";
  className?: string;
}) {
  const fills: Record<string, string> = {
    accent: "bg-accent",
    good: "bg-good",
    warn: "bg-warn",
    bad: "bg-bad",
  };
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-1.5 w-full rounded-full bg-surface-2 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${fills[tone]} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  tone?: "accent" | "bad";
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 overflow-x-auto pb-1 -mb-1 ${className}`} role="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        const activeTone = opt.tone === "bad" ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent-strong";
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`shrink-0 inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg transition-colors ${
              active ? activeTone : "text-ink-soft hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {opt.label}
            {opt.count != null && (
              <span className={`text-[11px] font-bold ${active ? "" : "text-ink-faint"}`}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-surface-2 text-ink-faint flex items-center justify-center mb-4 [&>svg]:w-6 [&>svg]:h-6">
          {icon}
        </div>
      )}
      <div className="font-semibold text-ink">{title}</div>
      {description && <p className="text-sm text-ink-faint mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`border-t border-border-soft ${className}`} />;
}

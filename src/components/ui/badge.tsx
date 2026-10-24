import type { ReactNode } from "react";

type Tone = "brand" | "accent" | "emerald" | "red" | "violet" | "slate" | "amber";

const TONES: Record<Tone, string> = {
  brand: "bg-brand-100 text-brand-800 ring-brand-300/60",
  accent: "bg-accent-100 text-accent-700 ring-accent-300/60",
  emerald: "bg-emerald-100 text-emerald-800 ring-emerald-300/60",
  red: "bg-red-100 text-red-800 ring-red-300/60",
  violet: "bg-violet-100 text-violet-800 ring-violet-300/60",
  amber: "bg-amber-100 text-amber-800 ring-amber-300/60",
  slate: "bg-slate-200/70 text-slate-700 ring-slate-300/70",
};

/** شارة حالة موحدة */
export function Badge({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** شارة حالة حضور حصة */
export function AttendanceBadge({ status }: { status: "present" | "absent" | "excused" | "late" | null }) {
  const map = {
    present: { ar: "حاضر", tone: "emerald" as Tone },
    absent: { ar: "غياب", tone: "red" as Tone },
    excused: { ar: "استئذان", tone: "amber" as Tone },
    late: { ar: "تأخير", tone: "violet" as Tone },
  };
  if (!status) return <Badge>—</Badge>;
  const s = map[status];
  return <Badge tone={s.tone}>{s.ar}</Badge>;
}

/** شارة ملخص اليوم */
export function DayStatusBadge({ status }: { status: string }) {
  const map: Record<string, { ar: string; tone: Tone }> = {
    present: { ar: "حاضر", tone: "emerald" },
    absent: { ar: "غائب", tone: "red" },
    partial: { ar: "غياب جزئي", tone: "amber" },
    excused: { ar: "غائب بعذر", tone: "violet" },
    late: { ar: "متأخر", tone: "violet" },
    not_recorded: { ar: "بلا رصد", tone: "slate" },
    school_off: { ar: "إجازة", tone: "slate" },
  };
  const s = map[status] ?? { ar: status, tone: "slate" as Tone };
  return <Badge tone={s.tone}>{s.ar}</Badge>;
}

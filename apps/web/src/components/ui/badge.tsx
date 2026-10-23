import type { ReactNode } from "react";

type Tone = "brand" | "accent" | "emerald" | "red" | "violet" | "slate" | "amber";

const TONES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  accent: "bg-accent-50 text-accent-700 ring-accent-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
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

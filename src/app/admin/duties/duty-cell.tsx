"use client";

import { useState, useTransition } from "react";
import { setDutyAction } from "@/server/actions/duties";

type Option = { id: string; name: string };

/** خلية مناوبة: قائمة معلمين لـ(موقع × يوم × أسبوع) — «—» تمسحها */
export function DutyCell({
  locationId, dayOfWeek, weekStart, teacherId, options, teacherName, label,
}: {
  locationId: string;
  dayOfWeek: number;
  weekStart: string;
  teacherId: string | null;
  teacherName: string | null;
  /** اسم نصي لمناوب بلا حساب */
  label: string | null;
  options: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onChange = (v: string) => {
    const fd = new FormData();
    fd.set("locationId", locationId);
    fd.set("dayOfWeek", String(dayOfWeek));
    fd.set("weekStart", weekStart);
    fd.set("teacherId", v);
    startTransition(async () => {
      const r = await setDutyAction(fd);
      setErr(r.ok ? null : r.error ?? "تعذر");
    });
  };

  return (
    <div className="p-1" title={err ?? undefined}>
      {label && !teacherId && (
        <p className="mb-0.5 truncate text-[10px] font-semibold text-slate-500" title={label}>{label}</p>
      )}
      <select
        value={teacherId ?? ""}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-w-28 rounded-lg border px-1.5 py-1 text-xs focus:outline-none disabled:opacity-50 ${
          err
            ? "border-red-300 bg-red-50 text-red-700"
            : teacherId || label
              ? "border-slate-200 bg-white text-slate-700"
              : "border-dashed border-slate-200 bg-slate-50 text-slate-400"
        }`}
      >
        <option value="">—</option>
        {teacherId && teacherName && !options.some((o) => o.id === teacherId) && (
          <option value={teacherId}>{teacherName} (موقوف)</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setCellAssignmentAction } from "@/server/actions/subjects";

type Option = { id: string; name: string; specialist: boolean };

/**
 * خلية مصفوفة التغطية: قائمة معلمين لـ(شعبة × مادة).
 * المتخصصون أولاً، ثم البقية — «—» تمسح الإسناد.
 */
export function AssignCell({
  classId, subjectId, teacherId, extra, quota, options,
}: {
  classId: string;
  subjectId: string;
  teacherId: string | null;
  /** إسنادات إضافية لنفس الثنائية (تجزئة التدريس) — تُعرض للتنبيه */
  extra: number;
  quota: number;
  options: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const gap = quota > 0 && !teacherId;

  const onChange = (v: string) => {
    const fd = new FormData();
    fd.set("classId", classId);
    fd.set("subjectId", subjectId);
    fd.set("teacherId", v);
    startTransition(async () => {
      const r = await setCellAssignmentAction(fd);
      setErr(r.ok ? null : r.error ?? "تعذر التحديث");
    });
  };

  if (quota <= 0 && !teacherId)
    return <span className="text-slate-300">—</span>;

  return (
    <div className="p-1" title={err ?? undefined}>
      <select
        value={teacherId ?? ""}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-w-28 rounded-lg border px-1.5 py-1 text-xs focus:outline-none disabled:opacity-50 ${
          err
            ? "border-red-300 bg-red-50 text-red-700"
            : gap
              ? "border-amber-300 bg-amber-50 font-bold text-amber-700"
              : "border-slate-200 bg-white text-slate-700"
        }`}
      >
        <option value="">{gap ? "⚠ فجوة" : "—"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.specialist ? "★ " : ""}{o.name}
          </option>
        ))}
      </select>
      {extra > 0 && (
        <p className="mt-0.5 text-[10px] text-amber-600">+{extra} معلم آخر مشارك</p>
      )}
      {quota > 0 && <p className="mt-0.5 text-[10px] text-slate-400">{quota} حصة/أ</p>}
    </div>
  );
}

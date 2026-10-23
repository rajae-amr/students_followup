"use client";

import { useState, useTransition } from "react";
import { setGradeAction } from "@/server/actions/grades";

/** خلية درجة — تحفظ عند فقدان التركيز وتظهر حالة الحفظ من الخادم */
export function GradeCell({
  assessmentId,
  studentId,
  studentName,
  initialScore,
  maxScore,
}: {
  assessmentId: string;
  studentId: string;
  studentName: string;
  initialScore: number | null;
  maxScore: number;
}) {
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");
  const [pending, startTransition] = useTransition();

  const save = (value: string) => {
    if (value !== "" && (Number(value) < 0 || Number(value) > maxScore)) {
      setSaved("err");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("assessmentId", assessmentId);
      fd.set("studentId", studentId);
      fd.set("score", value);
      const r = await setGradeAction(fd);
      setSaved(r.ok ? "ok" : "err");
    });
  };

  return (
    <input
      type="number"
      min={0}
      max={maxScore}
      step="any"
      defaultValue={initialScore ?? ""}
      onBlur={(e) => save(e.target.value)}
      disabled={pending}
      aria-label={`درجة ${studentName} من ${maxScore}`}
      placeholder="—"
      className={`w-20 rounded-lg border px-2 py-1.5 text-center text-sm transition focus:outline-none focus:ring-2 ${
        saved === "ok"
          ? "border-emerald-400 bg-emerald-50 ring-emerald-100"
          : saved === "err"
            ? "border-red-400 bg-red-50 ring-red-100"
            : "border-slate-200 focus:border-brand-400 focus:ring-brand-100"
      }`}
      dir="ltr"
    />
  );
}

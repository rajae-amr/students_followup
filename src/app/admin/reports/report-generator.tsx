"use client";

import { useState, useTransition } from "react";
import { approveReport, previewReport } from "@/server/actions/reports";
import type { StudentReportContent } from "@app/core";

export function ReportGenerator({
  students,
}: {
  students: { id: string; name: string }[];
}) {
  const [studentId, setStudentId] = useState("");
  const today = new Date().toLocaleDateString("en-CA");
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toLocaleDateString("en-CA");
  const [range, setRange] = useState({ start: weekAgo, end: today });
  const [report, setReport] = useState<StudentReportContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [pending, startTransition] = useTransition();

  const input =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  function load() {
    setError(null);
    setApproved(false);
    startTransition(async () => {
      const res = await previewReport({
        studentId,
        rangeStart: range.start,
        rangeEnd: range.end,
      });
      if (res.ok) setReport(res.report);
      else setError(res.error);
    });
  }

  function approve() {
    startTransition(async () => {
      const res = await approveReport({
        studentId,
        rangeStart: range.start,
        rangeEnd: range.end,
      });
      if (res.ok) setApproved(true);
      else setError(res.error ?? "فشل الاعتماد");
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className={input}
        >
          <option value="">الطالب…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} className={input} />
        <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} className={input} />
        <button
          onClick={load}
          disabled={!studentId || pending}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          معاينة
        </button>
        {report && !approved && (
          <button
            onClick={approve}
            disabled={pending}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            اعتماد التقرير
          </button>
        )}
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {approved && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">اعتُمد التقرير — صار جاهزاً للإرسال من القائمة أدناه.</p>}

      {report && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
          <p className="font-semibold">{report.student.name} — {report.student.className}</p>
          <p className="mt-1 text-slate-600">
            الفترة {report.range.start} → {report.range.end} · أيام مرصودة: {report.attendance.daysRecorded}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-emerald-100 px-2 py-1">حضور: {report.attendance.present}</span>
            <span className="rounded bg-red-100 px-2 py-1">غياب: {report.attendance.absent}</span>
            <span className="rounded bg-amber-100 px-2 py-1">غياب جزئي: {report.attendance.partial}</span>
            <span className="rounded bg-violet-100 px-2 py-1">تأخير: {report.attendance.late}</span>
            <span className="rounded bg-slate-200 px-2 py-1">استئذان: {report.attendance.excused}</span>
          </div>
          {report.attendance.lessonEntries.length > 0 && (
            <ul className="mt-3 space-y-1">
              {report.attendance.lessonEntries.map((e, i) => (
                <li key={i} className="text-xs text-slate-600">
                  {e.date} — حصة {e.period} ({e.subject}): {e.statusAr}
                </li>
              ))}
            </ul>
          )}
          {report.grades.map((g) => (
            <div key={g.subject + g.teacher} className="mt-3">
              <p className="text-xs font-semibold">{g.subject} — {g.teacher}</p>
              <ul className="text-xs text-slate-600">
                {g.assessments.map((a, i) => (
                  <li key={i}>{a.title} ({a.date}): {a.score ?? "—"} / {a.max}</li>
                ))}
              </ul>
            </div>
          ))}
          {report.evaluations.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold">التقييمات الأسبوعية</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {report.evaluations.map((e, i) => (
                  <li key={i}>
                    <span className="text-slate-400">{e.subject} —</span> {e.category}: <b>{e.value}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.behavior.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold">السلوك والملاحظات</p>
              <ul className="text-xs text-slate-600">
                {report.behavior.map((b, i) => (
                  <li key={i}>{b.date} — {b.teacher}: {b.category ?? ""} {b.text ?? ""}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

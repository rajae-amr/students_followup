"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  markStudent,
  markAllPresentAction,
  submitSessionAction,
  unmarkStudent,
} from "@/server/actions/attendance";
import { addNoteAction, recordBehaviorAction } from "@/server/actions/grades";
import type { LessonAttendance } from "@app/core";

type Row = {
  studentId: string;
  fullName: string;
  status: LessonAttendance | null;
  revision: number;
  isAssumed: boolean;
};

const BUTTONS: {
  status: LessonAttendance;
  label: string;
  active: string;
}[] = [
  { status: "absent", label: "غياب", active: "bg-red-600 text-white border-red-600" },
  { status: "excused", label: "استئذان", active: "bg-amber-500 text-white border-amber-500" },
  { status: "late", label: "تأخير", active: "bg-violet-600 text-white border-violet-600" },
];

const STATUS_STYLE: Record<LessonAttendance, { label: string; cls: string }> = {
  present: { label: "حاضر", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  absent: { label: "غياب", cls: "bg-red-50 text-red-700 ring-red-200" },
  excused: { label: "استئذان", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  late: { label: "تأخير", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
};

const BEHAVIOR = [
  { c: "excellent", label: "ممتاز", cls: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" },
  { c: "committed", label: "ملتزم", cls: "bg-sky-100 text-sky-800 hover:bg-sky-200" },
  { c: "needs_followup", label: "يحتاج متابعة", cls: "bg-amber-100 text-amber-800 hover:bg-amber-200" },
] as const;

/** ملاحظة/سلوك سريع على الطالب — تُفتح بالضغط على الزر */
function StudentExtras({
  sessionId,
  studentId,
  dateISO,
  pending,
  run,
}: {
  sessionId: string;
  studentId: string;
  dateISO: string;
  pending: boolean;
  run: (action: Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [internalOnly, setInternalOnly] = useState(false);
  const date = dateISO.slice(0, 10);
  const audience = internalOnly ? "internal" : "family";
  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:text-brand-600"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {open ? "إخفاء" : "ملاحظة / سلوك"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <label className="flex w-fit cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <input
              type="checkbox"
              checked={internalOnly}
              onChange={(e) => setInternalOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-slate-600"
            />
            🔒 داخلي فقط — لا يظهر لولي الأمر
          </label>
          <div className="flex flex-wrap gap-1.5">
            {BEHAVIOR.map((b) => (
              <button
                key={b.c}
                disabled={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("studentId", studentId);
                  fd.set("date", date);
                  fd.set("category", b.c);
                  fd.set("audience", audience);
                  fd.set("lessonSessionId", sessionId);
                  run(recordBehaviorAction(fd));
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${b.cls}`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              id={`note-${studentId}`}
              aria-label="ملاحظة على الطالب"
              placeholder="ملاحظة نصية…"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              disabled={pending}
              onClick={() => {
                const el = document.getElementById(`note-${studentId}`) as HTMLInputElement;
                if (!el.value.trim()) return;
                const fd = new FormData();
                fd.set("studentId", studentId);
                fd.set("text", el.value.trim());
                fd.set("audience", audience);
                run(addNoteAction(fd));
                el.value = "";
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              حفظ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RosterClient({
  sessionId,
  sessionStatus,
  dateISO,
  students,
  markedCount,
}: {
  sessionId: string;
  sessionStatus: string;
  dateISO: string;
  students: Row[];
  markedCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const locked = sessionStatus === "submitted" || sessionStatus === "cancelled";
  const pct = students.length ? Math.round((markedCount / students.length) * 100) : 0;

  function run(action: Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action;
      if (!res.ok) setError(res.error ?? "خطأ");
      router.refresh();
    });
  }

  return (
    <div>
      {/* شريط الإجراءات */}
      <div className="sticky top-[7.5rem] z-20 mb-4 rounded-2xl bg-white/95 p-3 shadow-soft ring-1 ring-slate-100 backdrop-blur md:top-20">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-36">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>مرصود {markedCount} من {students.length}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {!locked && (
            <div className="flex gap-2">
              <button
                disabled={pending}
                onClick={() => run(markAllPresentAction(sessionId))}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                الكل حاضر
              </button>
              <button
                disabled={pending}
                onClick={() => run(submitSessionAction(sessionId))}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                اعتماد الحصة
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-100">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {students.map((s, i) => {
          const st = s.status ? STATUS_STYLE[s.status] : null;
          return (
            <li
              key={s.studentId}
              className={`rounded-2xl bg-white p-3.5 ring-1 transition sm:px-4 ${
                s.status === "absent" ? "ring-red-200 bg-red-50/40" : "ring-slate-100 shadow-soft"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-40 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-800">{s.fullName}</p>
                    {st && (
                      <span className={`mt-0.5 inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ring-1 ${st.cls}`}>
                        {st.label}
                        {s.isAssumed ? " (مفترض)" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {!locked && (
                  <div className="flex items-center gap-1.5">
                    {BUTTONS.map((b) => (
                      <button
                        key={b.status}
                        disabled={pending}
                        onClick={() =>
                          run(
                            s.status === b.status
                              ? unmarkStudent({
                                  sessionId,
                                  studentId: s.studentId,
                                  expectedRevision: s.revision,
                                })
                              : markStudent({
                                  sessionId,
                                  studentId: s.studentId,
                                  status: b.status,
                                  expectedRevision: s.revision,
                                }),
                          )
                        }
                        aria-label={`${b.label} — ${s.fullName}`}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                          s.status === b.status
                            ? b.active
                            : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                    {s.status !== null && (
                      <button
                        disabled={pending}
                        onClick={() =>
                          run(
                            unmarkStudent({
                              sessionId,
                              studentId: s.studentId,
                              expectedRevision: s.revision,
                            }),
                          )
                        }
                        title="مسح"
                        aria-label={`مسح حالة ${s.fullName}`}
                        className="rounded-lg px-2 py-1.5 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!locked && (
                <StudentExtras
                  sessionId={sessionId}
                  studentId={s.studentId}
                  dateISO={dateISO}
                  pending={pending}
                  run={run}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

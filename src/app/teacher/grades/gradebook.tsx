"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setGradeAction, fillColumnAction, setGradeColumnAction,
  updateAssessmentAction, deleteAssessmentAction, publishAssessmentAction,
} from "@/server/actions/grades";

type Cell = { score: number | null; status: string };
type AssessmentCol = {
  id: string;
  title: string;
  kind: string;
  date: string; // ISO
  maxScore: number;
  published: boolean;
  grades: Record<string, Cell>;
};
type Weights = Partial<Record<string, number>> | null;

const KIND_AR: Record<string, string> = {
  quiz: "قصير", homework: "واجب", exam: "اختبار", participation: "مشاركة",
};
const KIND_COLOR: Record<string, string> = {
  exam: "bg-red-50 text-red-600", quiz: "bg-brand-50 text-brand-600",
  homework: "bg-amber-50 text-amber-600", participation: "bg-violet-50 text-violet-600",
};
const STATUS_INPUT: Record<string, { status: string; label: string }> = {
  "غ": { status: "absent", label: "غائب" },
  "ع": { status: "excused", label: "بعذر" },
  "م": { status: "exempt", label: "معفى" },
};
const STATUS_MARK: Record<string, { mark: string; cls: string }> = {
  absent: { mark: "غ", cls: "text-red-500" },
  excused: { mark: "ع", cls: "text-amber-600" },
  exempt: { mark: "م", cls: "text-slate-400" },
};

const letter = (p: number) => (p >= 90 ? "A" : p >= 80 ? "B" : p >= 70 ? "C" : p >= 60 ? "D" : "F");
const LETTER_CLS: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  B: "bg-brand-50 text-brand-700 ring-brand-200",
  C: "bg-amber-50 text-amber-700 ring-amber-200",
  D: "bg-orange-50 text-orange-700 ring-orange-200",
  F: "bg-red-50 text-red-700 ring-red-200",
};

/** نسبة طالب عبر كل الأعمدة — موزونة بأوزان المادة أو اختبارات فقط */
function studentPct(cells: Cell[], kinds: string[], maxes: number[], weights: Weights) {
  const scored = cells
    .map((c, i) => ({ ...c, kind: kinds[i]!, max: maxes[i]! }))
    .filter((c) => c.score != null && c.max > 0 && c.status === "normal");
  if (!scored.length) return null;
  if (weights && Object.values(weights).some((w) => w && w > 0)) {
    let acc = 0, wSum = 0;
    for (const [kind, w] of Object.entries(weights)) {
      if (!w || w <= 0) continue;
      const ks = scored.filter((c) => c.kind === kind);
      if (!ks.length) continue;
      acc += w * (ks.reduce((s, c) => s + (c.score! / c.max) * 100, 0) / ks.length);
      wSum += w;
    }
    if (!wSum) return null;
    return acc / wSum;
  }
  const exams = scored.filter((c) => c.kind === "exam" || c.kind === "quiz");
  if (!exams.length) return null;
  return exams.reduce((s, c) => s + (c.score! / c.max) * 100, 0) / exams.length;
}

/** دفتر درجات مصفوفي: طلاب × تقييمات — حفظ تلقائي عند مغادرة الخلية، Enter للطالب التالي */
export function Gradebook({
  students,
  assessments: initialCols,
  classId,
  subjectId,
  weights,
  terms,
}: {
  students: { id: string; fullName: string }[];
  assessments: AssessmentCol[];
  classId: string;
  subjectId: string;
  weights: Weights;
  terms: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<Record<string, "ok" | "err">>({});
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const refs = useRef<Map<string, HTMLInputElement>>(new Map());
  // نسخة حيّة من الخلايا لإحصاءات فورية — المصدر: الخادم عند كل revalidate
  const [cells, setCells] = useState<Record<string, Record<string, Cell>>>(() => {
    const m: Record<string, Record<string, Cell>> = {};
    for (const a of initialCols) m[a.id] = { ...a.grades };
    return m;
  });

  const kinds = initialCols.map((a) => a.kind);
  const maxes = initialCols.map((a) => a.maxScore);

  const colStats = useMemo(() => {
    const m = new Map<string, { avg: number | null; missing: number }>();
    for (const a of initialCols) {
      const col = cells[a.id] ?? {};
      let sum = 0, n = 0, missing = 0;
      for (const s of students) {
        const c = col[s.id];
        if (c && c.status === "normal" && c.score != null) { sum += c.score; n++; }
        else if (!c || (c.status === "normal" && c.score == null)) missing++;
      }
      m.set(a.id, { avg: n ? Math.round((sum / n / a.maxScore) * 1000) / 10 : null, missing });
    }
    return m;
  }, [cells, initialCols, students]);

  const key = (r: number, c: number) => `${r}:${c}`;
  const focus = (r: number, c: number) => refs.current.get(key(r, c))?.focus();

  const commit = (r: number, c: number, raw: string) => {
    const a = initialCols[c]!;
    const student = students[r]!;
    const v = raw.trim();
    const prev = cells[a.id]?.[student.id];

    let score: number | null = null;
    let status = "normal";
    if (STATUS_INPUT[v]) {
      status = STATUS_INPUT[v]!.status;
    } else if (v === "") {
      score = null; // مسح
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > a.maxScore) {
        setFlash((f) => ({ ...f, [key(r, c)]: "err" }));
        return;
      }
      score = n;
    }
    if ((prev?.score ?? null) === score && (prev?.status ?? "normal") === status) return;

    const cellKey = key(r, c);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("assessmentId", a.id);
      fd.set("studentId", student.id);
      fd.set("score", score === null ? "" : String(score));
      fd.set("status", status);
      const res = await setGradeAction(fd);
      if (res.ok) {
        setCells((m) => ({
          ...m,
          [a.id]: { ...m[a.id], [student.id]: { score, status } },
        }));
      }
      setFlash((f) => ({ ...f, [cellKey]: res.ok ? "ok" : "err" }));
      setTimeout(() => setFlash((f) => {
        const n = { ...f }; delete n[cellKey]; return n;
      }), 1600);
    });
  };

  const act = (fn: (fd: FormData) => Promise<{ ok: boolean }>, fd: FormData) =>
    startTransition(async () => { await fn(fd); router.refresh(); });

  const applyPaste = (a: AssessmentCol) => {
    const lines = pasteText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
    const rows: { studentId: string; score: number | null; status?: string }[] = [];
    lines.slice(0, students.length).forEach((l, i) => {
      const st = students[i]!;
      if (STATUS_INPUT[l]) rows.push({ studentId: st.id, score: null, status: STATUS_INPUT[l]!.status });
      else {
        const n = Number(l);
        if (Number.isFinite(n) && n >= 0 && n <= a.maxScore) rows.push({ studentId: st.id, score: n });
      }
    });
    if (!rows.length) return;
    const fd = new FormData();
    fd.set("assessmentId", a.id);
    fd.set("rows", JSON.stringify(rows));
    act(setGradeColumnAction, fd);
    setPasteFor(null);
    setPasteText("");
  };

  const inputCls =
    "w-9 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100";

  if (!initialCols.length) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky start-0 top-0 z-20 min-w-44 border-b border-slate-100 bg-slate-50 p-2 text-start text-xs font-bold text-slate-500">
              الطالب
            </th>
            {initialCols.map((a, c) => {
              const st = colStats.get(a.id);
              return (
                <th key={a.id} className={`min-w-32 border-b border-slate-100 p-1.5 align-top ${a.published ? "bg-slate-50" : "bg-amber-50/60"}`}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-700" title={a.title}>{a.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                        <span className={`rounded px-1 py-px font-bold ${KIND_COLOR[a.kind] ?? "bg-slate-100 text-slate-500"}`}>{KIND_AR[a.kind] ?? a.kind}</span>
                        <span dir="ltr">{a.date.slice(0, 10)}</span>
                        <span dir="ltr">/{a.maxScore}</span>
                        {!a.published && <span className="rounded bg-amber-100 px-1 font-bold text-amber-700">مسودة</span>}
                      </p>
                      {st && (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {st.avg !== null ? <>متوسط <b className="text-slate-600" dir="ltr">{st.avg}%</b></> : "لا درجات"}
                          {st.missing > 0 && <> · <span className="text-amber-600">{st.missing} بلا رصد</span></>}
                        </p>
                      )}
                    </div>
                    {/* قائمة العمود */}
                    <details className="relative shrink-0">
                      <summary className="cursor-pointer list-none rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600">⋮</summary>
                      <div className="absolute end-0 top-6 z-30 w-44 rounded-xl border border-slate-100 bg-white p-1.5 text-xs shadow-lift">
                        <button
                          className="block w-full rounded-lg px-2 py-1.5 text-start font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("id", a.id); fd.set("publish", String(!a.published));
                            act(publishAssessmentAction, fd);
                          }}
                          disabled={pending}
                        >
                          {a.published ? "إعادة لمسودة" : "نشر — يظهر في التقارير"}
                        </button>
                        <button
                          className="block w-full rounded-lg px-2 py-1.5 text-start font-semibold text-slate-600 hover:bg-brand-50"
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("assessmentId", a.id); fd.set("mode", "fill");
                            act(fillColumnAction, fd);
                          }}
                        >تعبئة الكل بالعظمى</button>
                        <button
                          className="block w-full rounded-lg px-2 py-1.5 text-start font-semibold text-slate-600 hover:bg-brand-50"
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("assessmentId", a.id); fd.set("mode", "absent");
                            act(fillColumnAction, fd);
                          }}
                        >الكل غائب</button>
                        <button
                          className="block w-full rounded-lg px-2 py-1.5 text-start font-semibold text-slate-600 hover:bg-brand-50"
                          onClick={() => setPasteFor(pasteFor === a.id ? null : a.id)}
                        >لصق كشف…</button>
                        <button
                          className="block w-full rounded-lg px-2 py-1.5 text-start font-semibold text-slate-600 hover:bg-brand-50"
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("assessmentId", a.id); fd.set("mode", "clear");
                            act(fillColumnAction, fd);
                          }}
                        >مسح العمود</button>
                        <button
                          className="block w-full rounded-lg px-2 py-1.5 text-start font-semibold text-red-500 hover:bg-red-50"
                          onClick={() => {
                            if (!confirm(`حذف «${a.title}» وكل درجاته نهائياً؟`)) return;
                            const fd = new FormData();
                            fd.set("id", a.id);
                            act(deleteAssessmentAction, fd);
                          }}
                        >حذف التقييم</button>
                      </div>
                    </details>
                  </div>
                  {/* تعديل سريع — تفاصيل العمود */}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] font-semibold text-slate-400 hover:text-brand-600">تعديل…</summary>
                    <form
                      className="mt-1 grid grid-cols-2 gap-1"
                      action={(fd) => act(updateAssessmentAction, fd)}
                    >
                      <input type="hidden" name="id" value={a.id} />
                      <input name="title" defaultValue={a.title} required className={`${inputCls} col-span-2`} placeholder="العنوان" />
                      <input name="date" type="date" defaultValue={a.date.slice(0, 10)} required className={inputCls} dir="ltr" />
                      <input name="maxScore" type="number" min={1} defaultValue={a.maxScore} required className={inputCls} dir="ltr" placeholder="العظمى" />
                      <select name="kind" defaultValue={a.kind} className={inputCls}>
                        {Object.entries({ quiz: "اختبار قصير", homework: "واجب", exam: "اختبار", participation: "مشاركة" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <select name="termId" defaultValue="" className={inputCls}>
                        <option value="">بلا فصل</option>
                        {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <button className="col-span-2 rounded-lg bg-brand-600 py-1 text-xs font-bold text-white hover:bg-brand-700">حفظ التعديل</button>
                    </form>
                  </details>
                </th>
              );
            })}
            <th className="sticky end-0 top-0 z-20 min-w-24 border-b border-slate-100 bg-brand-50/60 p-2 text-center text-xs font-bold text-brand-700">
              النسبة
            </th>
          </tr>
          {/* صف اللصق */}
          {pasteFor && (
            <tr>
              <td colSpan={initialCols.length + 2} className="bg-sky-50 p-3">
                <p className="mb-1.5 text-xs font-bold text-sky-800">
                  لصق كشف «{initialCols.find((a) => a.id === pasteFor)?.title}» — سطر لكل طالب بنفس ترتيب القائمة (رقم أو غ/ع/م):
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={6}
                  dir="ltr"
                  className="w-full rounded-lg border border-sky-200 bg-white p-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder={"18\n20\nغ\n17"}
                />
                <div className="mt-1.5 flex gap-2">
                  <button
                    className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-sky-700"
                    onClick={() => applyPaste(initialCols.find((a) => a.id === pasteFor)!)}
                  >تطبيق على العمود</button>
                  <button
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white"
                    onClick={() => { setPasteFor(null); setPasteText(""); }}
                  >إلغاء</button>
                </div>
              </td>
            </tr>
          )}
        </thead>
        <tbody>
          {students.map((s, r) => {
            const rowCells = initialCols.map((a) => cells[a.id]?.[s.id]);
            const pct = studentPct(
              rowCells.map((c) => c ?? { score: null, status: "normal" }),
              kinds, maxes, weights,
            );
            const lt = pct != null ? letter(pct) : null;
            return (
              <tr key={s.id} className="group">
                <td className="sticky start-0 z-10 border-b border-slate-50 bg-white p-2 font-medium text-slate-800 group-hover:bg-brand-50/30">
                  <span className="me-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{r + 1}</span>
                  {s.fullName}
                </td>
                {initialCols.map((a, c) => {
                  const cell = cells[a.id]?.[s.id];
                  const mark = cell && cell.status !== "normal" ? STATUS_MARK[cell.status] : null;
                  const f = flash[key(r, c)];
                  return (
                    <td key={a.id} className={`border-b border-slate-50 p-1 text-center ${a.published ? "" : "bg-amber-50/30"}`}>
                      <input
                        ref={(el) => { if (el) refs.current.set(key(r, c), el); else refs.current.delete(key(r, c)); }}
                        dir="ltr"
                        inputMode="decimal"
                        defaultValue={mark ? mark.mark : (cell?.score ?? "")}
                        key={`${a.id}:${s.id}:${cell?.score ?? ""}:${cell?.status ?? ""}`}
                        placeholder="—"
                        aria-label={`درجة ${s.fullName} — ${a.title}`}
                        title="رقم، أو غ=غائب · ع=بعذر · م=معفى"
                        onBlur={(e) => commit(r, c, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                            if (r + 1 < students.length) focus(r + 1, c);
                          } else if (e.key === "ArrowDown") { e.preventDefault(); focus(r + 1, c); }
                          else if (e.key === "ArrowUp") { e.preventDefault(); focus(r - 1, c); }
                          else if (e.key === "ArrowLeft") { e.preventDefault(); focus(r, c - 1); }
                          else if (e.key === "ArrowRight") { e.preventDefault(); focus(r, c + 1); }
                        }}
                        className={`w-16 rounded-lg border px-1.5 py-1.5 text-center text-sm transition focus:outline-none focus:ring-2 ${
                          mark ? `${mark.cls} font-bold border-slate-200 bg-slate-50` : ""
                        } ${
                          f === "ok" ? "border-emerald-400 bg-emerald-50 ring-emerald-100"
                          : f === "err" ? "border-red-400 bg-red-50 ring-red-100"
                          : mark ? "" : "border-slate-200 focus:border-brand-400 focus:ring-brand-100"
                        }`}
                      />
                    </td>
                  );
                })}
                <td className="sticky end-0 z-10 border-b border-slate-50 bg-brand-50/40 p-1 text-center">
                  {pct != null ? (
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ring-1 ${LETTER_CLS[lt!]}`} dir="ltr">
                      {Math.round(pct)}% {lt}
                    </span>
                  ) : <span className="text-xs text-slate-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-100 bg-slate-50/50 px-3 py-2 text-[11px] text-slate-400">
        الحفظ تلقائي عند مغادرة الخلية — أدخل رقماً أو حرف حالة: <b>غ</b> غائب · <b>ع</b> بعذر · <b>م</b> معفى · فراغ للمسح.
        الأسهم وEnter للتنقل. المسودات (العمود العنبري) لا تظهر في التقارير حتى النشر.
      </p>
    </div>
  );
}

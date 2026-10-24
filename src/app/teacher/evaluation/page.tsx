import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { setEvaluationRowAction } from "@/server/actions/grades";
import { WEEKLY_EVAL_CATEGORIES, WEEKLY_EVAL_OPTIONS, weekStartOf, academicStats } from "@app/core";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import type { Prisma } from "@prisma/client";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

const LETTER_TONE: Record<string, "emerald" | "brand" | "amber" | "red"> = {
  A: "emerald",
  B: "brand",
  C: "amber",
  D: "amber",
  F: "red",
};

/** قائمة الأسابيع: الاثنين بدايةً — الأحدث أولاً */
function weekOptions(count: number): Date[] {
  const cur = weekStartOf(new Date());
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(cur);
    d.setUTCDate(d.getUTCDate() - i * 7);
    return d;
  });
}

export default async function EvaluationPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; subject?: string; week?: string }>;
}) {
  const actor = await requireRole("teacher");
  const { class: classId, subject: subjectId, week: weekParam } = await searchParams;

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const assignments = await prisma.teachingAssignment.findMany({
    where: { teacherId: actor.userId, academicYearId: year?.id, isActive: true },
    include: { class: { select: { displayName: true } }, subject: { select: { name: true } } },
  });

  const classOpts = [...new Map(assignments.map((a) => [a.classId, a.class.displayName])).entries()];
  const subjectOpts = [...new Map(assignments.map((a) => [a.subjectId, a.subject.name])).entries()];

  // الأسبوع المحدد — الافتراضي الأسبوع الحالي
  const weeks = weekOptions(12);
  const weekStart = weekParam ? new Date(`${weekParam}T00:00:00.000Z`) : weeks[0]!;
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekKey = weekStart.toISOString().slice(0, 10);

  const ready = classId && subjectId;
  const roster = ready
    ? await prisma.enrollment.findMany({
        where: { classId, academicYearId: year?.id, student: { isActive: true } },
        include: { student: { select: { id: true, fullName: true } } },
        orderBy: { student: { fullName: "asc" } },
      })
    : [];

  // تقييمات هذا الأسبوع + درجات اختبارات الأسبوع لحساب التقدير آلياً
  const [evals, weekGrades] = ready
    ? await Promise.all([
        prisma.evaluation.findMany({
          where: {
            teacherId: actor.userId,
            subjectId,
            weekStart,
            studentId: { in: roster.map((r) => r.studentId) },
          },
        }),
        prisma.grade.findMany({
          where: {
            studentId: { in: roster.map((r) => r.studentId) },
            assessment: {
              teacherId: actor.userId,
              subjectId,
              date: { gte: weekStart, lt: weekEnd },
            },
          },
          include: { assessment: { select: { kind: true, maxScore: true } } },
        }),
      ])
    : [[], []];

  const evalMap = new Map(evals.map((e) => [`${e.studentId}|${e.category}`, e.value]));
  const statsByStudent = new Map<string, { pct: number; letter: string }>();
  for (const r of roster) {
    const items = weekGrades
      .filter((g) => g.studentId === r.studentId)
      .map((g) => ({ score: g.score, max: g.assessment.maxScore, kind: g.assessment.kind }));
    const s = academicStats(items);
    if (s) statsByStudent.set(r.studentId, s);
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString("ar", { day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="التقييم الأسبوعي"
        subtitle="المشاركة والكتب تُقيَّم أسبوعياً — الدرجة الأكاديمية والتقدير تُحسب من الاختبارات آلياً"
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-600">
            الصف
            <select name="class" defaultValue={classId} required className={`${input} mt-1 block`}>
              <option value="">اختر…</option>
              {classOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-600">
            المادة
            <select name="subject" defaultValue={subjectId} required className={`${input} mt-1 block`}>
              <option value="">اختر…</option>
              {subjectOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-600">
            الأسبوع
            <select name="week" defaultValue={weekKey} className={`${input} mt-1 block`}>
              {weeks.map((w) => {
                const key = w.toISOString().slice(0, 10);
                return (
                  <option key={key} value={key}>
                    {key === weeks[0]!.toISOString().slice(0, 10) ? "الحالي — " : ""}
                    {fmt(w)}
                  </option>
                );
              })}
            </select>
          </label>
          <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
            عرض الكشف
          </button>
        </form>
      </Card>

      {ready &&
        (roster.length === 0 ? (
          <EmptyState icon="students" title="لا طلاب في هذا الصف" />
        ) : (
          <Card className="overflow-x-auto">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
              أسبوع {fmt(weekStart)} — {fmt(weekEnd)}
            </div>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">الطالب</th>
                  <th className="text-start font-semibold" colSpan={WEEKLY_EVAL_CATEGORIES.length + 2}>
                    بنود التقييم
                  </th>
                </tr>
              </thead>
              <tbody>
                {roster.map((
                  e: Prisma.EnrollmentGetPayload<{ include: { student: { select: { id: true; fullName: true } } } }>,
                  i: number,
                ) => {
                  const stats = statsByStudent.get(e.studentId);
                  return (
                    <tr key={e.studentId} className="border-t border-slate-100">
                      <td className="w-52 py-3 pe-3">
                        <span className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                            {i + 1}
                          </span>
                          <span className="font-medium text-slate-800">{e.student.fullName}</span>
                        </span>
                      </td>
                      <td colSpan={WEEKLY_EVAL_CATEGORIES.length + 2}>
                        <span className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
                          {/* بندان محسوبان آلياً — للعرض فقط */}
                          <span className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-medium text-slate-400">الدرجة الأكاديمية</span>
                            <span className="grid h-[30px] place-items-center rounded-lg bg-slate-50 text-xs font-bold text-slate-700 ring-1 ring-slate-100">
                              {stats ? `${stats.pct}%` : "—"}
                            </span>
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-medium text-slate-400">التقدير</span>
                            <span className="grid h-[30px] place-items-center">
                              {stats ? (
                                <Badge tone={LETTER_TONE[stats.letter] ?? "slate"}>{stats.letter}</Badge>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </span>
                          </span>
                          {/* بنود يدوية أسبوعية */}
                          <FormWithResult action={setEvaluationRowAction} submitLabel="حفظ" bare>
                            <input type="hidden" name="studentId" value={e.studentId} />
                            <input type="hidden" name="subjectId" value={subjectId} />
                            <input type="hidden" name="weekStart" value={weekKey} />
                            <span className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-3">
                              {WEEKLY_EVAL_CATEGORIES.map((c) => (
                                <span key={c} className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-medium text-slate-400">{c}</span>
                                  <select
                                    name={`eval_${c}`}
                                    defaultValue={
                                      evalMap.get(`${e.studentId}|${c}`) ?? WEEKLY_EVAL_OPTIONS[c][0]
                                    }
                                    aria-label={`${c} — ${e.student.fullName}`}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                                  >
                                    <option value="">—</option>
                                    {WEEKLY_EVAL_OPTIONS[c].map((o) => (
                                      <option key={o} value={o}>{o}</option>
                                    ))}
                                  </select>
                                </span>
                              ))}
                            </span>
                          </FormWithResult>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
              <Icon.check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              «حفظ» يحفظ بنود الطالب لهذا الأسبوع — القيمة الافتراضية معبّأة مسبقاً، عدّل
              الاستثناءات فقط، واختر «—» لترك البند بلا تقييم. الدرجة الأكاديمية والتقدير يُحسبان
              من اختبارات الأسبوع (اختبار + اختبار قصير) ولا يحتاجان إدخالاً.
            </p>
          </Card>
        ))}

      {!ready && (
        <EmptyState
          icon="evaluation"
          title="اختر الصف والمادة"
          hint="حدد الصف والمادة والأسبوع لعرض كشف التقييم"
        />
      )}
    </div>
  );
}

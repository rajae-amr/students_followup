import Link from "next/link";
import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { weekStartOf, schoolWeekDays } from "@app/core";
import { submitPlanAction, unsubmitPlanAction, copyPlanToClassesAction, submitAllSubjectPlansAction } from "@/server/actions/plans";
import { FormWithResult } from "@/components/form-result";
import { PlanEditor } from "@/components/plan-editor";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

const STATUS_AR: Record<string, { label: string; tone: "slate" | "amber" | "emerald" }> = {
  draft: { label: "مسودة", tone: "slate" },
  submitted: { label: "مسلّمة", tone: "emerald" },
};

/** قائمة الأسابيع: الاثنين بدايةً — الأحدث أولاً */
function weekOptions(count: number): Date[] {
  const cur = weekStartOf(new Date());
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(cur);
    d.setUTCDate(d.getUTCDate() - i * 7 + 7); // يبدأ بالأسبوع القادم للتخطيط المسبق
    return d;
  });
}

export default async function TeacherPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; subject?: string; week?: string }>;
}) {
  const actor = await requireRole("teacher", "admin");
  const { class: classId, subject: subjectId, week: weekParam } = await searchParams;

  const [year, weekDays] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    schoolWeekDays(),
  ]);

  const assignments = await prisma.teachingAssignment.findMany({
    where: { teacherId: actor.userId, academicYearId: year?.id, isActive: true },
    include: {
      class: { select: { displayName: true, name: true, gradeId: true, grade: { select: { name: true } } } },
      subject: { select: { name: true } },
    },
  });
  const classOpts = [...new Map(assignments.map((a) => [a.classId, a.class.displayName ?? a.class.name])).entries()];
  const subjectOpts = [
    ...new Map(
      assignments
        .filter((a) => !classId || a.classId === classId)
        .map((a) => [a.subjectId, a.subject.name]),
    ).entries(),
  ];

  const weeks = weekOptions(12);
  const weekStart = weekParam ? weekStartOf(new Date(weekParam)) : weeks[1]!; // الافتراضي: الأسبوع الحالي
  const weekKey = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const ready = Boolean(classId && subjectId);
  const plan = ready
    ? await prisma.weeklyPlan.findUnique({
        where: {
          teacherId_classId_subjectId_weekStart: {
            teacherId: actor.userId, classId: classId!, subjectId: subjectId!, weekStart,
          },
        },
        include: { entries: true },
      })
    : null;

  // تعبئة مقترحة لخطة فارغة: خطة الأسبوع الماضي لنفس الشعبة، وإلا خطة شعبة شقيقة لنفس الأسبوع
  let entries = plan?.entries ?? [];
  let prefilledFrom: string | null = null;
  if (ready && !entries.length) {
    const prev = await prisma.weeklyPlan.findFirst({
      where: {
        teacherId: actor.userId, classId: classId!, subjectId: subjectId!,
        weekStart: { lt: weekStart }, entries: { some: {} },
      },
      orderBy: { weekStart: "desc" },
      include: { entries: true },
    });
    if (prev?.entries.length) {
      entries = prev.entries;
      prefilledFrom = "prev";
    } else {
      const sib = await prisma.weeklyPlan.findFirst({
        where: {
          teacherId: actor.userId, subjectId: subjectId!, weekStart,
          classId: { not: classId! }, entries: { some: {} },
        },
        include: { entries: true },
      });
      if (sib?.entries.length) {
        entries = sib.entries;
        prefilledFrom = "sib";
      }
    }
  }

  // شعب أخرى يدرّسها المعلم لنفس المادة — لتطبيق الخطة عليها دفعة واحدة
  const siblings = ready
    ? [...new Map(
        assignments
          .filter((a) => a.subjectId === subjectId && a.classId !== classId)
          .map((a) => [a.classId, a.class] as const),
      ).entries()]
    : [];
  const siblingPlans = siblings.length
    ? await prisma.weeklyPlan.findMany({
        where: { teacherId: actor.userId, subjectId: subjectId!, weekStart, classId: { in: siblings.map(([id]) => id) } },
        select: { classId: true, status: true },
      })
    : [];
  const sibStatus = new Map(siblingPlans.map((p) => [p.classId, p.status]));
  const selGradeId = assignments.find((a) => a.classId === classId)?.class.gradeId;

  // خطط المعلم الحديثة — للرجوع السريع
  const recent = await prisma.weeklyPlan.findMany({
    where: { teacherId: actor.userId },
    include: {
      class: { select: { displayName: true } },
      subject: { select: { name: true } },
    },
    orderBy: { weekStart: "desc" },
    take: 6,
  });

  const fmt = (d: Date) => d.toLocaleDateString("ar", { day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="الخطة الأسبوعية"
        subtitle="عبّئ محتوى الأسبوع لمادتك ثم سلّمه — الإدارة تجمّع خطط الصف وتنشرها لأولياء الأمور"
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-600">
            الصف
            <select name="class" defaultValue={classId} required className={`${input} mt-1 block w-44`}>
              <option value="">اختر…</option>
              {classOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-600">
            المادة
            <select name="subject" defaultValue={subjectId} required className={`${input} mt-1 block w-40`}>
              <option value="">اختر…</option>
              {subjectOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-600">
            الأسبوع
            <select name="week" defaultValue={weekKey} className={`${input} mt-1 block w-44`}>
              {weeks.map((w, i) => {
                const key = w.toISOString().slice(0, 10);
                return (
                  <option key={key} value={key}>
                    {i === 0 ? "القادم — " : i === 1 ? "الحالي — " : ""}{fmt(w)}
                  </option>
                );
              })}
            </select>
          </label>
          <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
            فتح الخطة
          </button>
        </form>
      </Card>

      {ready && (
        <Card className="mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold text-slate-800">
              <Icon.schedule className="h-5 w-5 text-brand-600" />
              خطة أسبوع {fmt(weekStart)} – {fmt(weekEnd)}
              {plan && (
                <Badge tone={STATUS_AR[plan.status]?.tone ?? "slate"}>
                  {STATUS_AR[plan.status]?.label ?? plan.status}
                </Badge>
              )}
            </h2>
            {plan && (
              <div className="flex items-center gap-3">
                {plan.status === "submitted" ? (
                  <FormWithResult action={unsubmitPlanAction} submitLabel="إرجاع للمسودة" bare>
                    <input type="hidden" name="planId" value={plan.id} />
                  </FormWithResult>
                ) : (
                  <FormWithResult action={submitPlanAction} submitLabel="✅ تسليم للتجميع" bare
                    buttonClass="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700">
                    <input type="hidden" name="planId" value={plan.id} />
                  </FormWithResult>
                )}
                <Link
                  href={`/teacher/plan/print?plan=${plan.id}`}
                  target="_blank"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  🖨 طباعة
                </Link>
              </div>
            )}
          </div>

          {prefilledFrom && (
            <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
              💡 عبّأنا الحقول اقتراحاً من {prefilledFrom === "prev" ? "خطتك للأسبوع الماضي لهذه الشعبة" : "خطتك لشعبة أخرى لنفس المادة هذا الأسبوع"}
              {" "}— راجعها وعدّل ما يلزم ثم احفظ؛ لم تُنشأ خطة بعد.
            </p>
          )}
          <PlanEditor
            classId={classId!}
            subjectId={subjectId!}
            weekKey={weekKey}
            weekDays={weekDays}
            entries={entries}
          />
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
            <Icon.check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            «حفظ المسودة» تحفظ دون إرسال — «تسليم للتجميع» تعلن جاهزية خطتك ليدمجها مدير
            المدرسة مع بقية المواد في مستند واحد يرسل لأولياء الأمور.
          </p>
        </Card>
      )}

      {ready && siblings.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-1 font-bold text-slate-800">تطبيق على شعب أخرى لنفس المادة</h2>
          <p className="mb-3 text-xs text-slate-500">
            تدرّس المادة نفسها لشعب أخرى — حددها لتنسخ محتوى هذه الخطة إليها دفعة واحدة.
            المسودات القائمة تُبدَّل، والمسلّمة تُتخطّى.
          </p>
          <FormWithResult action={copyPlanToClassesAction} submitLabel="تطبيق على المحددة">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="weekStart" value={weekKey} />
            <div className="flex w-full flex-wrap gap-2">
              {siblings.map(([cid, cls]) => {
                const st = sibStatus.get(cid);
                const sameGrade = cls.gradeId && cls.gradeId === selGradeId;
                return (
                  <label key={cid}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      st === "submitted"
                        ? "border-slate-200 bg-slate-50 text-slate-400"
                        : "border-slate-200 hover:border-brand-300 hover:bg-brand-50"
                    }`}>
                    <input type="checkbox" name="classIds" value={cid} disabled={st === "submitted"} />
                    {cls.displayName ?? cls.name}
                    {sameGrade && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">نفس المستوى</span>}
                    {st === "submitted" ? (
                      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">مسلّمة</span>
                    ) : st === "draft" ? (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">مسودة</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            {!plan?.entries.length && (
              <p className="mt-2 w-full text-xs text-amber-600">احفظ محتوى الخطة أعلاه أولاً ثم طبّقها على الشعب.</p>
            )}
          </FormWithResult>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <FormWithResult action={submitAllSubjectPlansAction} submitLabel="✅ تسليم خطط كل الشعب للتجميع" bare
              buttonClass="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700">
              <input type="hidden" name="subjectId" value={subjectId} />
              <input type="hidden" name="weekStart" value={weekKey} />
            </FormWithResult>
            <p className="mt-1.5 text-[11px] text-slate-400">يسلّم كل مسوداتك لهذه المادة في هذا الأسبوع دفعة واحدة.</p>
          </div>
        </Card>
      )}

      {!ready && (
        <EmptyState
          icon="schedule"
          title="اختر الصف والمادة"
          hint="حدد الصف والمادة والأسبوع لتحرير خطتك الأسبوعية"
        />
      )}

      {recent.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold text-slate-800">خططي الأخيرة</h2>
          <ul className="divide-y divide-slate-100">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <Link
                  href={`/teacher/plan?class=${p.classId}&subject=${p.subjectId}&week=${p.weekStart.toISOString().slice(0, 10)}`}
                  className="font-medium text-slate-700 hover:text-brand-700"
                >
                  {p.class.displayName} — {p.subject.name} · أسبوع {fmt(p.weekStart)}
                </Link>
                <Badge tone={STATUS_AR[p.status]?.tone ?? "slate"}>
                  {STATUS_AR[p.status]?.label ?? p.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

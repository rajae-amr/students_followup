import Link from "next/link";
import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { weekStartOf, schoolWeekDays } from "@app/core";
import { submitPlanAction, unsubmitPlanAction } from "@/server/actions/plans";
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
      class: { select: { displayName: true, name: true } },
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

          <PlanEditor
            classId={classId!}
            subjectId={subjectId!}
            weekKey={weekKey}
            weekDays={weekDays}
            entries={plan?.entries ?? []}
          />
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
            <Icon.check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            «حفظ المسودة» تحفظ دون إرسال — «تسليم للتجميع» تعلن جاهزية خطتك ليدمجها مدير
            المدرسة مع بقية المواد في مستند واحد يرسل لأولياء الأمور.
          </p>
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

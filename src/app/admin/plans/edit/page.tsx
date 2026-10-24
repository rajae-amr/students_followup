import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@app/db";
import { requirePerm } from "@/server/session";
import { weekStartOf, schoolWeekDays } from "@app/core";
import { PlanEditor } from "@/components/plan-editor";
import { submitPlanAction, unsubmitPlanAction } from "@/server/actions/plans";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminPlanEditPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string; class?: string; subject?: string; week?: string }>;
}) {
  await requirePerm("plans");
  const { teacher: teacherId, class: classId, subject: subjectId, week: weekParam } =
    await searchParams;
  if (!teacherId || !classId || !subjectId || !weekParam) redirect("/admin/plans");

  const weekStart = weekStartOf(new Date(weekParam));
  const weekKey = weekStart.toISOString().slice(0, 10);

  const [teacher, classGroup, subject, weekDays, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: teacherId }, select: { name: true } }),
    prisma.classGroup.findUnique({ where: { id: classId }, select: { displayName: true, name: true } }),
    prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } }),
    schoolWeekDays(),
    prisma.weeklyPlan.findUnique({
      where: {
        teacherId_classId_subjectId_weekStart: { teacherId, classId, subjectId, weekStart },
      },
      include: { entries: true },
    }),
  ]);
  if (!teacher || !classGroup || !subject) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`خطة ${subject.name} — ${classGroup.displayName ?? classGroup.name}`}
        subtitle={`تحرير نيابة عن ${teacher.name} · أسبوع ${weekKey}`}
      />
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge tone={plan?.status === "submitted" ? "emerald" : "amber"}>
              {plan ? (plan.status === "submitted" ? "مسلّمة" : "مسودة") : "لم تُدخل بعد"}
            </Badge>
            {plan && (plan.status === "submitted" ? (
              <FormWithResult action={unsubmitPlanAction} submitLabel="إرجاع للمسودة" bare>
                <input type="hidden" name="planId" value={plan.id} />
              </FormWithResult>
            ) : (
              <FormWithResult action={submitPlanAction} submitLabel="✅ تسليم للتجميع" bare
                buttonClass="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700">
                <input type="hidden" name="planId" value={plan.id} />
              </FormWithResult>
            ))}
          </div>
          <Link
            href={`/admin/plans?class=${classId}&week=${weekKey}`}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            → العودة للوحة التجميع
          </Link>
        </div>
        <PlanEditor
          classId={classId}
          subjectId={subjectId}
          teacherId={teacherId}
          weekKey={weekKey}
          weekDays={weekDays}
          entries={plan?.entries ?? []}
        />
      </Card>
    </div>
  );
}

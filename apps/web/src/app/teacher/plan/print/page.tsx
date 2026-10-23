import { notFound, redirect } from "next/navigation";
import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { schoolWeekDays } from "@app/core";
import { PlanDocument } from "@/components/plan-document";
import { PrintButton } from "@/components/print-button";

/** طباعة خطة مادة واحدة — المعلم لخطته أو الإدارة لأي خطة */
export default async function PlanPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const actor = await requireRole("teacher", "admin");
  const { plan: planId } = await searchParams;
  if (!planId) redirect("/teacher/plan");

  const [plan, weekDays, settings] = await Promise.all([
    prisma.weeklyPlan.findUnique({
      where: { id: planId },
      include: {
        entries: true,
        class: { select: { displayName: true, name: true } },
        subject: { select: { name: true } },
        teacher: { select: { name: true } },
      },
    }),
    schoolWeekDays(),
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
  ]);
  if (!plan || (actor.role !== "admin" && plan.teacherId !== actor.userId)) notFound();

  const fmt = (d: Date) => d.toLocaleDateString("ar", { day: "numeric", month: "long" });
  const end = new Date(plan.weekStart);
  end.setUTCDate(end.getUTCDate() + 6);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 print:hidden">
        <PrintButton label="🖨 طباعة / حفظ PDF" />
      </div>
      <PlanDocument
        schoolName={settings?.schoolName ?? "المدرسة"}
        className={plan.class.displayName ?? plan.class.name}
        weekRange={`${fmt(plan.weekStart)} – ${fmt(end)}`}
        weekDays={weekDays}
        subjects={[
          {
            subjectId: plan.subjectId,
            subjectName: plan.subject.name,
            teacherName: plan.teacher.name,
            missing: false,
            entries: plan.entries,
          },
        ]}
      />
    </div>
  );
}

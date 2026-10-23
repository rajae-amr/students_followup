import Link from "next/link";
import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { weekStartOf, classPlanMatrix } from "@app/core";
import { publishClassPlanAction } from "@/server/actions/plans";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

const STATUS = {
  missing: { label: "لم تُدخل", tone: "slate" as const },
  draft: { label: "مسودة", tone: "amber" as const },
  submitted: { label: "مسلّمة", tone: "emerald" as const },
};

function weekOptions(count: number): Date[] {
  const cur = weekStartOf(new Date());
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(cur);
    d.setUTCDate(d.getUTCDate() - i * 7 + 7);
    return d;
  });
}

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; week?: string }>;
}) {
  await requireRole("admin");
  const { class: classId, week: weekParam } = await searchParams;

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const classes = await prisma.classGroup.findMany({
    where: { academicYearId: year?.id, isActive: true },
    orderBy: { displayName: "asc" },
  });

  const weeks = weekOptions(12);
  const weekStart = weekParam ? weekStartOf(new Date(weekParam)) : weeks[1]!;
  const weekKey = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const [matrix, publications] = classId
    ? await Promise.all([
        classPlanMatrix(classId, weekStart),
        prisma.classWeeklyPlanPublication.findMany({
          where: { classId },
          orderBy: { publishedAt: "desc" },
          take: 5,
          select: { id: true, weekStart: true, publishedAt: true, contentJson: true },
        }),
      ])
    : [[], []];

  const fmt = (d: Date) => d.toLocaleDateString("ar", { day: "numeric", month: "long" });
  const submittedCount = matrix.filter((m) => m.status === "submitted").length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="الخطط الأسبوعية"
        subtitle="حالة خطط معلمي الصف — التجميع والنشر يرسل مستنداً واحداً لأولياء الأمور"
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-600">
            الصف
            <select name="class" defaultValue={classId} required className={`${input} mt-1 block w-48`}>
              <option value="">اختر…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.displayName ?? c.name}</option>)}
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
            عرض الحالة
          </button>
        </form>
      </Card>

      {classId && (
        <Card className="mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold text-slate-800">
              <Icon.schedule className="h-5 w-5 text-brand-600" />
              أسبوع {fmt(weekStart)} – {fmt(weekEnd)}
              <Badge tone={submittedCount === matrix.length && matrix.length > 0 ? "emerald" : "amber"}>
                {submittedCount}/{matrix.length} مسلّمة
              </Badge>
            </h2>
            {matrix.length > 0 && (
              <FormWithResult
                action={publishClassPlanAction}
                submitLabel="📤 تجميع ونشر لأولياء الأمور"
                bare
                buttonClass="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                <input type="hidden" name="classId" value={classId} />
                <input type="hidden" name="weekStart" value={weekKey} />
              </FormWithResult>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">المادة</th>
                  <th className="text-start font-semibold">المعلم</th>
                  <th className="text-start font-semibold">الحالة</th>
                  <th className="text-start font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.assignmentId} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-800">{m.subjectName}</td>
                    <td className="text-slate-600">{m.teacherName}</td>
                    <td><Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge></td>
                    <td>
                      <Link
                        href={`/admin/plans/edit?teacher=${m.teacherId}&class=${classId}&subject=${m.subjectId}&week=${weekKey}`}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        {m.planId ? "تحرير" : "إدخال نيابة"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            «تجميع ونشر» تُنشئ لقطة موحّدة بكل الخطط المدخلة وتُشعِر أولياء أمور الصف —
            المواد غير المدخلة تُعلَّم «لم تُسلَّم» في المستند.
          </p>
        </Card>
      )}

      {classId && publications.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold text-slate-800">لقطات منشورة لهذا الصف</h2>
          <ul className="divide-y divide-slate-100">
            {publications.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-slate-700">
                  أسبوع {fmt(p.weekStart)} — {(p.contentJson as unknown[]).length} مواد
                </span>
                <Link href={`/admin/plans/${p.id}`} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  عرض اللقطة
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!classId && (
        <EmptyState icon="schedule" title="اختر الصف" hint="حدد الصف والأسبوع لعرض حالة الخطط" />
      )}
    </div>
  );
}

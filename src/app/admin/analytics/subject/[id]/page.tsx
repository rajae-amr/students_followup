import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { rangeFromParams, gradeStats, toKey } from "@/server/analytics";
import { FilterBar } from "../../filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { DonutChart, HBars } from "@/components/charts";

const KIND_AR: Record<string, string> = {
  test: "اختبار", quiz: "قصير", homework: "واجب", participation: "مشاركة",
};
const TH = "px-3 py-2 text-right text-[11px] font-bold text-slate-500";
const TD = "px-3 py-2.5 text-sm tabular-nums";

type Params = { range?: string; term?: string };

/** لوحة مادة — متوسطها حسب المراحل والصفوف ومعلموها وتوزيع تقديراتها */
export default async function SubjectAnalyticsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  await requirePerm("attendance");
  const [{ id: subjectId }, sp] = await Promise.all([params, searchParams]);

  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const [subject, year] = await Promise.all([
    prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
  ]);
  if (!subject) notFound();
  const terms = year
    ? await prisma.term.findMany({
        where: { academicYearId: year.id }, orderBy: { startDate: "asc" },
        select: { id: true, name: true, startDate: true, endDate: true },
      })
    : [];

  const { range, termId, from, to, prevFrom, prevTo, rangeLabel } = rangeFromParams(sp, terms, today0);
  const scope = { from, to, prevFrom, prevTo, yearId: year?.id, subjectId };

  const [grades, assignments] = await Promise.all([
    gradeStats(scope),
    prisma.teachingAssignment.findMany({
      where: { subjectId, isActive: true, ...(year ? { academicYearId: year.id } : {}) },
      select: {
        teacherId: true,
        class: { select: { id: true, displayName: true, name: true, grade: { select: { name: true } } } },
      },
    }),
  ]);

  const teacherIds = [...new Set(assignments.map((a) => a.teacherId))];
  const teachers = teacherIds.length
    ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
    : [];
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
  const classAvg = new Map(grades.classAvgs.map((c) => [c.id, c.value]));

  const letterData = (["A", "B", "C", "D", "F"] as const).map((l, i) => ({
    name: `تقدير ${l}`, value: grades.letters[l], color: ["#0d9488", "#14b8a6", "#f59e0b", "#fbbf24", "#ef4444"][i]!,
  })).filter((d) => d.value > 0);
  const filterQ = `?range=${range}&term=${termId}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`مادة ${subject.name}`}
        subtitle={`${rangeLabel} · ${toKey(from)} ← ${toKey(to)}`}
        crumbs={[
          { label: "الشؤون الأكاديمية" },
          { label: "التحليلات", href: "/admin/analytics" },
          { label: `مادة ${subject.name}` },
        ]}
      />
      <FilterBar range={range} termId={termId} terms={terms} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="متوسط المادة" value={grades.overallAvg !== null ? `${grades.overallAvg}%` : "—"} icon="grades" />
        <StatCard label="درجات منشورة" value={grades.count} icon="check" />
        <StatCard label="تقييمات منشورة" value={grades.published} icon="evaluation" />
        <StatCard label="تقييمات مسودة" value={grades.drafts} icon="evaluation" tone={grades.drafts ? "amber" : "slate"} />
        <StatCard label="صفوف تدرسها" value={assignments.length} icon="attendance" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">المتوسط حسب المرحلة</h3>
          {grades.levelAvgs.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا درجات منشورة</p> : (
            <HBars data={grades.levelAvgs} unit="%" />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">توزيع التقديرات</h3>
          {letterData.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا درجات منشورة</p> : (
            <DonutChart data={letterData} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">التقييمات حسب النوع</h3>
          {grades.kindCounts.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا تقييمات</p> : (
            <HBars
              data={grades.kindCounts.map((k) => ({ label: KIND_AR[k.kind] ?? k.kind, value: k.count }))}
              color="#8b5cf6"
            />
          )}
        </Card>
      </div>

      {/* المتوسط حسب الصف + المعلمون */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-bold text-slate-700">المتوسط حسب الصف</h3>
          <p className="mb-3 text-xs text-slate-400">يكشف صفاً يتعثر في المادة — اضغط لتحليل الصف</p>
          {grades.classAvgs.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا درجات منشورة</p> : (
            <ul className="space-y-2">
              {grades.classAvgs.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/analytics/class/${c.id}${filterQ}`} className="group flex items-center gap-3">
                    <span className="w-28 truncate text-xs font-semibold text-slate-600 group-hover:text-brand-700 group-hover:underline">{c.label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className={`block h-full rounded-full ${c.value < 60 ? "bg-red-500" : "bg-teal-500"}`} style={{ width: `${Math.min(100, c.value)}%` }} />
                    </span>
                    <span className="w-9 text-left text-xs font-bold tabular-nums text-slate-700">{c.value}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-700">معلمو المادة</h3>
            <p className="text-xs text-slate-400">إسنادات التدريس النشطة ومتوسط صفوفهم فيها</p>
          </div>
          {assignments.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">لا إسنادات نشطة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/60">
                  <tr>
                    <th className={TH}>المعلم</th>
                    <th className={TH}>الصف</th>
                    <th className={TH}>المرحلة</th>
                    <th className={TH}>متوسط الصف٪</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.map((a) => {
                    const avg = classAvg.get(a.class.id);
                    return (
                      <tr key={`${a.teacherId}-${a.class.id}`} className="hover:bg-slate-50/50">
                        <td className={`${TD} font-semibold text-slate-700`}>{teacherName.get(a.teacherId) ?? "—"}</td>
                        <td className={TD}>
                          <Link href={`/admin/analytics/class/${a.class.id}${filterQ}`} className="text-brand-700 hover:underline">
                            {a.class.displayName ?? a.class.name}
                          </Link>
                        </td>
                        <td className={`${TD} text-slate-500`}>{a.class.grade?.name ?? "—"}</td>
                        <td className={TD}>
                          {avg !== undefined ? (
                            <span className={avg < 60 ? "font-bold text-red-600" : "text-teal-700"}>{avg}%</span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export const metadata = { title: "تحليلات المادة" };

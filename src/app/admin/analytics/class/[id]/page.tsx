import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import {
  rangeFromParams, attendanceStats, dayDistribution, violationRows, atRiskStudents,
  sessionStats, gradeStats, behaviorStats, toKey, VIOLATION_SERIES,
} from "@/server/analytics";
import { FilterBar } from "../../filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendArea, DonutChart } from "@/components/charts";

const CAT_AR: Record<string, string> = {
  excellent: "سلوك متميز", committed: "ملتزم", needs_followup: "يحتاج متابعة",
};
const BEHAVIOR_COLORS = ["#0d9488", "#f59e0b", "#ef4444"];
const TH = "px-3 py-2 text-right text-[11px] font-bold text-slate-500";
const TD = "px-3 py-2.5 text-sm tabular-nums";

type Params = { range?: string; term?: string };

/** لوحة صف — اتجاهه ومواده وسلوكه وطلابه المعرّضون وحصصه غير المرصودة */
export default async function ClassAnalyticsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  await requirePerm("attendance");
  const [{ id: classId }, sp] = await Promise.all([params, searchParams]);

  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const [cls, year] = await Promise.all([
    prisma.classGroup.findUnique({
      where: { id: classId },
      select: { id: true, displayName: true, name: true, gradeId: true, grade: { select: { id: true, name: true } } },
    }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
  ]);
  if (!cls) notFound();
  const className = cls.displayName ?? cls.name;
  const terms = year
    ? await prisma.term.findMany({
        where: { academicYearId: year.id }, orderBy: { startDate: "asc" },
        select: { id: true, name: true, startDate: true, endDate: true },
      })
    : [];

  const { range, termId, from, to, prevFrom, prevTo, rangeLabel } = rangeFromParams(sp, terms, today0);
  const scope = { from, to, prevFrom, prevTo, yearId: year?.id, classId };

  const [att, today, issues, sessions, grades, behav, studentsCount, assignments, assessBySubj] = await Promise.all([
    attendanceStats(scope),
    dayDistribution(today0, scope),
    violationRows(scope),
    sessionStats(scope, today0),
    gradeStats(scope),
    behaviorStats(scope),
    prisma.enrollment.count({ where: { classId, ...(year ? { academicYearId: year.id } : {}) } }),
    prisma.teachingAssignment.findMany({
      where: { classId, isActive: true, ...(year ? { academicYearId: year.id } : {}) },
      select: { subjectId: true, subject: { select: { name: true } }, teacherId: true },
    }),
    prisma.assessment.groupBy({
      by: ["subjectId"], _count: { _all: true },
      where: { classId, publishedAt: { not: null }, date: { gte: from, lte: to } },
    }),
  ]);

  const teacherIds = [...new Set(assignments.map((a) => a.teacherId))];
  const teachers = teacherIds.length
    ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
    : [];
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));

  const subjAvg = new Map(grades.subjectAvgs.map((s) => [s.id, s.value]));
  const subjAssess = new Map(assessBySubj.map((a) => [a.subjectId, a._count._all]));
  const risk = atRiskStudents(issues);
  const rateDelta = att.rate !== null && att.prevRate !== null ? att.rate - att.prevRate : null;
  const behavCatData = behav.cats.map((b, i) => ({
    name: CAT_AR[b.cat] ?? "أخرى", value: b.count, color: BEHAVIOR_COLORS[i % 3]!,
  }));
  const filterQ = `?range=${range}&term=${termId}`;

  const crumbs = [
    { label: "الشؤون الأكاديمية" },
    { label: "التحليلات", href: "/admin/analytics" },
    ...(cls.grade ? [{ label: cls.grade.name, href: `/admin/analytics/level/${cls.grade.id}${filterQ}` }] : []),
    { label: className },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={className} subtitle={`${rangeLabel} · ${toKey(from)} ← ${toKey(to)}`} crumbs={crumbs} />
      <FilterBar range={range} termId={termId} terms={terms} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="الطلاب" value={studentsCount} icon="attendance" />
        <StatCard label="حضور الصف" value={att.rate !== null ? `${att.rate}%` : "—"} icon="check" delta={rateDelta} hint="مقابل السابقة" />
        <StatCard label="حضور اليوم" value={today.rate !== null ? `${today.rate}%` : "—"} icon="attendance" />
        <StatCard label="متوسط الصف" value={grades.overallAvg !== null ? `${grades.overallAvg}%` : "—"} icon="grades" />
        <StatCard label="اكتمال رصد اليوم" value={sessions.rate !== null ? `${sessions.rate}%` : "—"} icon="check" hint={sessions.total ? `${sessions.done}/${sessions.total}` : "لا حصص"} />
        <StatCard label="طلاب معرّضون" value={risk.length} icon="bell" tone={risk.length ? "amber" : "slate"} hint="3+ أيام" />
      </div>

      {/* جدول مواد الصف */}
      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">مواد الصف</h2>
          <p className="text-xs text-slate-400">المتوسط والتقييمات المنشورة لكل مادة — اضغط لتحليل المادة</p>
        </div>
        {assignments.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">لا إسنادات تدريس نشطة لهذا الصف</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className={TH}>المادة</th>
                  <th className={TH}>المعلم</th>
                  <th className={TH}>متوسط الصف٪</th>
                  <th className={TH}>تقييمات منشورة</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((a) => (
                  <tr key={a.subjectId} className="hover:bg-slate-50/50">
                    <td className={`${TD} font-bold text-slate-800`}>{a.subject.name}</td>
                    <td className={`${TD} text-slate-500`}>{teacherName.get(a.teacherId) ?? "—"}</td>
                    <td className={TD}>
                      {subjAvg.has(a.subjectId) ? (
                        <span className={(subjAvg.get(a.subjectId) ?? 0) < 60 ? "font-bold text-red-600" : "text-teal-700"}>
                          {subjAvg.get(a.subjectId)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className={TD}>{subjAssess.get(a.subjectId) ?? 0}</td>
                    <td className={TD}>
                      <Link href={`/admin/analytics/subject/${a.subjectId}${filterQ}`} className="text-xs font-bold text-brand-600 hover:underline">
                        تحليل المادة ←
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">اتجاه مخالفات الصف</h3>
          {att.trend.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا بيانات</p> : (
            <TrendArea data={att.trend} series={VIOLATION_SERIES} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">فئات السلوك في الصف</h3>
          {behavCatData.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا ملاحظات</p> : (
            <DonutChart data={behavCatData} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">حصص اليوم غير المرصودة</h3>
          {sessions.unrecorded.length === 0 ? (
            <EmptyState icon="check" title="اكتمل الرصد" hint="كل حصص الصف اليوم مسجّلة" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.unrecorded.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  <Badge tone="amber">حصة {s.period}</Badge>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{s.subjectName}</span>
                  <span className="shrink-0 text-xs text-slate-400">{s.teacherName}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">
            الطلاب المعرّضون <Badge tone="amber">3+ أيام</Badge>
          </h3>
          {risk.length === 0 ? (
            <EmptyState icon="attendance" title="لا معرّضون" hint={`لا طالب تجاوز 3 أيام مخالفات في ${rangeLabel}`} />
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {risk.map(([id, s]) => (
                <li key={id} className="flex items-center gap-3 py-2.5">
                  <Link href={`/admin/students/${classId}/${id}`} className="min-w-0 flex-1 truncate font-semibold text-slate-800 hover:text-brand-700 hover:underline">
                    {s.name}
                  </Link>
                  <Badge tone={s.count >= 6 ? "red" : "amber"}>{s.count} أيام</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export const metadata = { title: "تحليلات الصف" };

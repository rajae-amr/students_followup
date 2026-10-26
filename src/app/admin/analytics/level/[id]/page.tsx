import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import {
  rangeFromParams, attendanceStats, violationRows, atRiskStudents, classSizes,
  sessionStats, gradeStats, behaviorStats, toKey, VIOLATION_SERIES,
} from "@/server/analytics";
import { FilterBar } from "../../filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendArea, DonutChart, HBars } from "@/components/charts";

const CAT_AR: Record<string, string> = {
  excellent: "سلوك متميز", committed: "ملتزم", needs_followup: "يحتاج متابعة",
};
const BEHAVIOR_COLORS = ["#0d9488", "#f59e0b", "#ef4444"];
const TH = "px-3 py-2 text-right text-[11px] font-bold text-slate-500";
const TD = "px-3 py-2.5 text-sm tabular-nums";

type Params = { range?: string; term?: string };

/** لوحة مرحلة دراسية — مقارنة صفوفها وتحليل موادها وطلابها المعرّضين */
export default async function LevelAnalyticsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  await requirePerm("attendance");
  const [{ id: levelId }, sp] = await Promise.all([params, searchParams]);

  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const [level, year] = await Promise.all([
    prisma.gradeLevel.findUnique({ where: { id: levelId }, select: { id: true, name: true } }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
  ]);
  if (!level) notFound();
  const terms = year
    ? await prisma.term.findMany({
        where: { academicYearId: year.id }, orderBy: { startDate: "asc" },
        select: { id: true, name: true, startDate: true, endDate: true },
      })
    : [];

  const { range, termId, from, to, prevFrom, prevTo, rangeLabel } = rangeFromParams(sp, terms, today0);
  const scope = { from, to, prevFrom, prevTo, yearId: year?.id, levelId };

  const [att, issues, sizes, sessions, grades, behav, classes] = await Promise.all([
    attendanceStats(scope),
    violationRows(scope),
    classSizes(year?.id, levelId),
    sessionStats(scope, today0),
    gradeStats(scope),
    behaviorStats(scope),
    prisma.classGroup.findMany({
      where: { gradeId: levelId, isActive: true, ...(year ? { academicYearId: year.id } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, displayName: true, name: true },
    }),
  ]);

  // نسبة حضور لكل صف في المرحلة (استعلام متوازٍ لكل صف — قليلة العدد)
  const classRates = new Map(
    await Promise.all(
      classes.map(async (c) => {
        const rows = await prisma.dailySummary.groupBy({
          by: ["status"], _count: { _all: true },
          where: {
            date: { gte: from, lte: to },
            student: { enrollments: { some: { classId: c.id, ...(year ? { academicYearId: year.id } : {}) } } },
          },
        });
        let present = 0, total = 0;
        for (const r of rows) { total += r._count._all; if (r.status === "present") present += r._count._all; }
        return [c.id, total ? Math.round((present / total) * 100) : null] as const;
      }),
    ),
  );

  const violByClass = new Map<string, number>();
  for (const r of issues) violByClass.set(r.classId, (violByClass.get(r.classId) ?? 0) + 1);
  const behavByClass = new Map(behav.byClass.map((b) => [b.id, b.value]));
  const avgByClass = new Map(grades.classAvgs.map((c) => [c.id, c.value]));
  const risk = atRiskStudents(issues);
  const riskByClass = new Map<string, number>();
  for (const [, s] of risk) riskByClass.set(s.classId, (riskByClass.get(s.classId) ?? 0) + 1);

  const rateDelta = att.rate !== null && att.prevRate !== null ? att.rate - att.prevRate : null;
  const behavCatData = behav.cats.map((b, i) => ({
    name: CAT_AR[b.cat] ?? "أخرى", value: b.count, color: BEHAVIOR_COLORS[i % 3]!,
  }));
  const filterQ = `?range=${range}&term=${termId}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={level.name}
        subtitle={`${rangeLabel} · ${toKey(from)} ← ${toKey(to)}`}
        crumbs={[
          { label: "الشؤون الأكاديمية" },
          { label: "التحليلات", href: "/admin/analytics" },
          { label: level.name },
        ]}
      />
      <FilterBar range={range} termId={termId} terms={terms} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="نسبة حضور المرحلة" value={att.rate !== null ? `${att.rate}%` : "—"} icon="attendance" delta={rateDelta} hint="مقابل السابقة" />
        <StatCard label="متوسط الدرجات" value={grades.overallAvg !== null ? `${grades.overallAvg}%` : "—"} icon="grades" />
        <StatCard label="اكتمال رصد اليوم" value={sessions.rate !== null ? `${sessions.rate}%` : "—"} icon="check" hint={sessions.total ? `${sessions.done}/${sessions.total}` : "لا حصص"} />
        <StatCard label="مخالفات الحضور" value={issues.length} icon="check" />
        <StatCard label="ملاحظات سلوكية" value={behav.total} icon="evaluation" />
        <StatCard label="طلاب معرّضون" value={risk.length} icon="bell" tone={risk.length ? "amber" : "slate"} hint="3+ أيام" />
      </div>

      {/* جدول مقارنة الصفوف */}
      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">صفوف المرحلة</h2>
          <p className="text-xs text-slate-400">اضغط صفاً لتحليله التفصيلي</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/60">
              <tr>
                <th className={TH}>الصف</th>
                <th className={TH}>طلاب</th>
                <th className={TH}>حضور٪</th>
                <th className={TH}>متوسط٪</th>
                <th className={TH}>مخالفات</th>
                <th className={TH}>سلوك</th>
                <th className={TH}>معرّضون</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {classes.map((c) => {
                const r = classRates.get(c.id);
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className={`${TD} font-bold text-slate-800`}>{c.displayName ?? c.name}</td>
                    <td className={TD}>{sizes.get(c.id) ?? 0}</td>
                    <td className={TD}>
                      <span className={r !== null && r !== undefined && r < 85 ? "font-bold text-red-600" : "text-teal-700"}>
                        {r !== null && r !== undefined ? `${r}%` : "—"}
                      </span>
                    </td>
                    <td className={TD}>{avgByClass.has(c.id) ? `${avgByClass.get(c.id)}%` : "—"}</td>
                    <td className={TD}>{violByClass.get(c.id) ?? 0}</td>
                    <td className={TD}>{behavByClass.get(c.id) ?? 0}</td>
                    <td className={TD}>
                      {(riskByClass.get(c.id) ?? 0) > 0
                        ? <Badge tone="amber">{riskByClass.get(c.id)}</Badge>
                        : <span className="text-slate-400">0</span>}
                    </td>
                    <td className={TD}>
                      <Link href={`/admin/analytics/class/${c.id}${filterQ}`} className="text-xs font-bold text-brand-600 hover:underline">
                        التفاصيل ←
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">اتجاه مخالفات المرحلة</h3>
          {att.trend.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا بيانات</p> : (
            <TrendArea data={att.trend} series={VIOLATION_SERIES} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-bold text-slate-700">متوسط المواد في المرحلة</h3>
          <p className="mb-3 text-xs text-slate-400">اضغط مادة لتحليلها على مستوى المدرسة</p>
          {grades.subjectAvgs.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا درجات منشورة</p> : (
            <ul className="space-y-2">
              {grades.subjectAvgs.slice(0, 10).map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/analytics/subject/${s.id}${filterQ}`} className="group flex items-center gap-3">
                    <span className="w-24 truncate text-xs font-semibold text-slate-600 group-hover:text-brand-700 group-hover:underline">{s.label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, s.value)}%` }} />
                    </span>
                    <span className="w-9 text-left text-xs font-bold tabular-nums text-slate-700">{s.value}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">فئات السلوك في المرحلة</h3>
          {behavCatData.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا ملاحظات</p> : (
            <DonutChart data={behavCatData} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">
            الطلاب المعرّضون في المرحلة <Badge tone="amber">3+ أيام</Badge>
          </h3>
          {risk.length === 0 ? (
            <EmptyState icon="attendance" title="لا معرّضون" hint={`لا طالب تجاوز 3 أيام مخالفات في ${rangeLabel}`} />
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {risk.map(([id, s]) => (
                <li key={id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    {s.classId ? (
                      <Link href={`/admin/students/${s.classId}/${id}`} className="block truncate font-semibold text-slate-800 hover:text-brand-700 hover:underline">
                        {s.name}
                      </Link>
                    ) : (
                      <span className="block truncate font-semibold text-slate-800">{s.name}</span>
                    )}
                    <span className="block text-xs text-slate-400">{s.className}</span>
                  </span>
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

export const metadata = { title: "تحليلات المرحلة" };

import Link from "next/link";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import {
  rangeFromParams, attendanceStats, dayDistribution, violationRows, atRiskStudents,
  classSizes, sessionStats, gradeStats, behaviorStats, opsStats, levelsTable, toKey,
  VIOLATION_SERIES,
} from "@/server/analytics";
import { FilterBar } from "./filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendArea, BarsChart, DonutChart, HBars } from "@/components/charts";

const CAT_AR: Record<string, string> = {
  excellent: "سلوك متميز",
  committed: "ملتزم",
  needs_followup: "يحتاج متابعة",
};
const OUT_LABEL: Record<string, string> = {
  done: "تم", failed: "فشل", pending: "معلق", processing: "قيد الإرسال", cancelled: "ملغى",
};
const BEHAVIOR_COLORS = ["#0d9488", "#f59e0b", "#ef4444"];
const TH = "px-3 py-2 text-right text-[11px] font-bold text-slate-500";
const TD = "px-3 py-2.5 text-sm tabular-nums";

type Params = { range?: string; term?: string };

/** لوحة التحليلات العامة — نظرة المدرسة كاملة مع التعمّق نحو المراحل */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePerm("attendance");
  const sp = await searchParams;

  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const terms = year
    ? await prisma.term.findMany({
        where: { academicYearId: year.id }, orderBy: { startDate: "asc" },
        select: { id: true, name: true, startDate: true, endDate: true },
      })
    : [];

  const { range, termId, from, to, prevFrom, prevTo, rangeLabel } = rangeFromParams(sp, terms, today0);
  const scope = { from, to, prevFrom, prevTo, yearId: year?.id };

  const [att, today, issues, sizes, sessions, grades, behav, ops] = await Promise.all([
    attendanceStats(scope),
    dayDistribution(today0, scope),
    violationRows(scope),
    classSizes(year?.id),
    sessionStats(scope, today0),
    gradeStats(scope),
    behaviorStats(scope),
    opsStats(from, to),
  ]);

  const chronic = atRiskStudents(issues).slice(0, 15);

  // مجمّعات المراحل لجدول المقارنة
  const violByLevel = new Map<string, number>();
  const violByClass = new Map<string, { name: string; count: number }>();
  for (const r of issues) {
    if (r.gradeId) violByLevel.set(r.gradeId, (violByLevel.get(r.gradeId) ?? 0) + 1);
    const c = violByClass.get(r.classId) ?? { name: r.className, count: 0 };
    c.count++;
    violByClass.set(r.classId, c);
  }
  const levels = await levelsTable(scope, { viol: violByLevel, behav: behav.byLevel, grades: grades.levelRaw });

  const classRates = [...violByClass.entries()]
    .map(([id, c]) => ({ label: c.name, value: Math.round((c.count / Math.max(1, sizes.get(id) ?? 1)) * 100) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const rateDelta = att.rate !== null && att.prevRate !== null ? att.rate - att.prevRate : null;

  const behavCatData = behav.cats.map((b, i) => ({
    name: CAT_AR[b.cat] ?? "أخرى", value: b.count, color: BEHAVIOR_COLORS[i % 3]!,
  }));
  const channelData = ops.channels.map((c, i) => ({
    name: c.channel === "telegram" ? "تيليجرام" : "البوابة",
    value: c.count,
    color: i === 0 ? "#0d9488" : "#94a3b8",
  }));
  const letterData = (["A", "B", "C", "D", "F"] as const).map((l, i) => ({
    name: `تقدير ${l}`, value: grades.letters[l], color: ["#0d9488", "#14b8a6", "#f59e0b", "#fbbf24", "#ef4444"][i]!,
  })).filter((d) => d.value > 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="التحليلات"
        subtitle={`${rangeLabel} · ${toKey(from)} ← ${toKey(to)}${year ? ` · ${year.name}` : ""}`}
        crumbs={[{ label: "الشؤون الأكاديمية" }, { label: "التحليلات" }]}
      />
      <FilterBar range={range} termId={termId} terms={terms} />

      {/* بطاقات المؤشرات */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="نسبة الحضور اليوم" value={today.rate !== null ? `${today.rate}%` : "—"} icon="attendance" />
        <StatCard label="متوسط حضور الفترة" value={att.rate !== null ? `${att.rate}%` : "—"} icon="grades" delta={rateDelta} hint="مقابل السابقة" />
        <StatCard label="اكتمال رصد اليوم" value={sessions.rate !== null ? `${sessions.rate}%` : "—"} icon="check" hint={sessions.total ? `${sessions.done}/${sessions.total} حصة` : "لا حصص"} />
        <StatCard label="تقييمات مسودة" value={grades.drafts} icon="evaluation" tone="amber" hint={`${grades.published} منشوراً`} />
        <StatCard label="إرسال فاشل" value={ops.failed} icon="bell" tone={ops.failed ? "red" : "slate"} />
      </div>

      {/* ═══ مقارنة المراحل — بوابة التعمّق ═══ */}
      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">مقارنة المراحل الدراسية</h2>
          <p className="text-xs text-slate-400">اضغط مرحلة للتعمّق في صفوفها وموادها</p>
        </div>
        {levels.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">لا مراحل معرّفة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className={TH}>المرحلة</th>
                  <th className={TH}>صفوف</th>
                  <th className={TH}>طلاب</th>
                  <th className={TH}>حضور٪</th>
                  <th className={TH}>مخالفات</th>
                  <th className={TH}>سلوك</th>
                  <th className={TH}>متوسط٪</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {levels.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className={`${TD} font-bold text-slate-800`}>{l.name}</td>
                    <td className={TD}>{l.classes}</td>
                    <td className={TD}>{l.students}</td>
                    <td className={TD}>
                      <span className={l.rate !== null && l.rate < 85 ? "font-bold text-red-600" : "text-teal-700"}>
                        {l.rate !== null ? `${l.rate}%` : "—"}
                      </span>
                    </td>
                    <td className={TD}>{l.viol}</td>
                    <td className={TD}>{l.behav}</td>
                    <td className={TD}>{l.avg !== null ? `${l.avg}%` : "—"}</td>
                    <td className={TD}>
                      <Link href={`/admin/analytics/level/${l.id}?range=${range}&term=${termId}`} className="text-xs font-bold text-brand-600 hover:underline">
                        التفاصيل ←
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ═══ الحضور ═══ */}
      <h2 className="mb-3 mt-6 flex items-center gap-2 text-base font-bold text-slate-800">
        الحضور <Badge tone="brand">{rangeLabel}</Badge>
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">مخالفات الحضور — اتجاه الفترة</h3>
          {att.trend.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا بيانات في هذه الفترة</p> : (
            <TrendArea data={att.trend} series={VIOLATION_SERIES} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">توزيع حالات اليوم</h3>
          {today.total === 0 ? <p className="py-8 text-center text-sm text-slate-400">لم تُرصد حالات بعد اليوم</p> : (
            <DonutChart
              centerLabel={`${today.rate ?? 0}%`}
              data={[
                { name: "حاضر", value: today.map.get("present") ?? 0, color: "#0d9488" },
                { name: "غائب", value: today.map.get("absent") ?? 0, color: "#dc2626" },
                { name: "غياب جزئي", value: today.map.get("partial") ?? 0, color: "#f97316" },
                { name: "متأخر", value: today.map.get("late") ?? 0, color: "#eab308" },
                { name: "بعذر", value: today.map.get("excused") ?? 0, color: "#8b5cf6" },
              ].filter((d) => d.value > 0)}
            />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-bold text-slate-700">نمط أيام الأسبوع</h3>
          <p className="mb-3 text-xs text-slate-400">متوسط المخالفات لكل يوم أسبوعي — أي يوم يكثر الغياب؟</p>
          <BarsChart data={att.weekdayPattern} color="#f59e0b" />
        </Card>
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-bold text-slate-700">أكثر الصفوف مخالفات</h3>
          <p className="mb-3 text-xs text-slate-400">لكل 100 طالب — مقارنة عادلة بغضّ النظر عن حجم الصف</p>
          {classRates.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا مخالفات مسجلة</p> : (
            <HBars data={classRates} color="#f59e0b" />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">حصص اليوم غير المرصودة</h3>
          {sessions.unrecorded.length === 0 ? (
            <EmptyState icon="check" title="اكتمل الرصد" hint="كل حصص اليوم مسجّلة — أو لا حصص مجدولة اليوم" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.unrecorded.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  <Badge tone="amber">حصة {s.period}</Badge>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                    {s.className} — {s.subjectName}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{s.teacherName}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/attendance" className="mt-3 inline-block text-xs font-bold text-brand-600 hover:underline">
            متابعة الحضور ←
          </Link>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">
            طلاب متكررة مخالفاتهم <Badge tone="amber">3+ أيام</Badge>
          </h3>
          {chronic.length === 0 ? (
            <EmptyState icon="attendance" title="لا يوجد تكرار" hint={`لا طالب تجاوز 3 أيام مخالفات في ${rangeLabel}`} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {chronic.map(([id, s]) => (
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

      {/* ═══ الدرجات ═══ */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-base font-bold text-slate-800">
        الدرجات <Badge tone="brand">{grades.count} درجة منشورة</Badge>
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-bold text-slate-700">متوسط المواد</h3>
          <p className="mb-3 text-xs text-slate-400">اضغط مادة لتحليلها التفصيلي</p>
          {grades.subjectAvgs.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا درجات منشورة</p> : (
            <ul className="space-y-2">
              {grades.subjectAvgs.slice(0, 10).map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/analytics/subject/${s.id}?range=${range}&term=${termId}`} className="group flex items-center gap-3">
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
          <h3 className="mb-4 text-sm font-bold text-slate-700">توزيع التقديرات</h3>
          {letterData.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا درجات منشورة</p> : (
            <DonutChart data={letterData} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">متوسط الصفوف</h3>
          {grades.classAvgs.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا درجات منشورة</p> : (
            <ul className="space-y-2">
              {grades.classAvgs.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/analytics/class/${c.id}?range=${range}&term=${termId}`} className="group flex items-center gap-3">
                    <span className="w-24 truncate text-xs font-semibold text-slate-600 group-hover:text-brand-700 group-hover:underline">{c.label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, c.value)}%` }} />
                    </span>
                    <span className="w-9 text-left text-xs font-bold tabular-nums text-slate-700">{c.value}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ═══ السلوك ═══ */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-base font-bold text-slate-800">
        السلوك <Badge tone="brand">{behav.total} ملاحظة</Badge>
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">الفئات</h3>
          {behavCatData.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا ملاحظات سلوكية</p> : (
            <DonutChart data={behavCatData} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">الاتجاه اليومي</h3>
          {behav.trend.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا ملاحظات</p> : (
            <BarsChart data={behav.trend} color="#8b5cf6" />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">أكثر الصفوف ملاحظات</h3>
          {behav.byClass.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا ملاحظات</p> : (
            <HBars data={behav.byClass.slice(0, 8)} color="#8b5cf6" />
          )}
        </Card>
      </div>

      {/* ═══ التشغيل والتوصيل ═══ */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-base font-bold text-slate-800">
        التشغيل والتوصيل <Badge tone="brand">{rangeLabel}</Badge>
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">نجاح الإرسال</h3>
          {ops.outStatus.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا أحداث إرسال</p> : (
            <DonutChart
              centerLabel={ops.successRate !== null ? `${ops.successRate}%` : "—"}
              data={ops.outStatus.filter((s) => s.count > 0).map((s) => ({
                name: OUT_LABEL[s.status] ?? s.status,
                value: s.count,
                color: { done: "#0d9488", failed: "#ef4444", pending: "#f59e0b", processing: "#fbbf24", cancelled: "#94a3b8" }[s.status] ?? "#e2e8f0",
              }))}
            />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">القنوات</h3>
          {channelData.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا أحداث</p> : (
            <DonutChart data={channelData} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">قراءة التقارير</h3>
          <div className="flex h-40 flex-col items-center justify-center text-center">
            <p className="text-4xl font-bold tabular-nums text-brand-700">{ops.readRate !== null ? `${ops.readRate}%` : "—"}</p>
            <p className="mt-2 text-sm text-slate-500">
              {ops.sentSnaps} تقريراً مُرسلاً · {ops.viewEvents} قراءة موثقة
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export const metadata = { title: "التحليلات" };

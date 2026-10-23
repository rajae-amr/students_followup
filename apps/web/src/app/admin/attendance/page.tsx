import { prisma } from "@app/db";
import { schoolTodayStr, schoolTimezone } from "@app/core";
import { requireRole } from "@/server/session";
import type { ClassGroup, Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const STATUS: Record<string, { label: string; tone: "emerald" | "red" | "amber" | "violet" | "slate" }> = {
  present: { label: "حاضر", tone: "emerald" },
  absent: { label: "غائب", tone: "red" },
  excused: { label: "غائب بعذر", tone: "amber" },
  partial: { label: "غياب جزئي", tone: "violet" },
  late: { label: "متأخر", tone: "slate" },
};
const ENTRY: Record<string, { label: string; cls: string }> = {
  present: { label: "ح", cls: "bg-emerald-100 text-emerald-700" },
  absent: { label: "غ", cls: "bg-red-100 text-red-700" },
  excused: { label: "ع", cls: "bg-amber-100 text-amber-700" },
  late: { label: "ت", cls: "bg-violet-100 text-violet-700" },
};

/** تصفح سجلات الحضور — مقابل /attendance القديم */
export default async function AdminAttendance({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; date?: string }>;
}) {
  await requireRole("admin");
  const { class: classId, date: dateParam } = await searchParams;
  const dateStr = dateParam ?? schoolTodayStr(await schoolTimezone());
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const classes = await prisma.classGroup.findMany({
    where: { academicYearId: year?.id, isActive: true },
    orderBy: { name: "asc" },
  });

  const selectedClass = classes.find((c: ClassGroup) => c.id === classId) ?? null;
  const roster = selectedClass
    ? await prisma.enrollment.findMany({
        where: { classId: selectedClass.id, academicYearId: year?.id, student: { isActive: true } },
        include: { student: { select: { id: true, fullName: true } } },
        orderBy: { student: { fullName: "asc" } },
      })
    : [];
  const studentIds = roster.map((r) => r.studentId);

  const [summaries, sessions] = selectedClass
    ? await Promise.all([
        prisma.dailySummary.findMany({
          where: { studentId: { in: studentIds }, date },
        }),
        prisma.lessonSession.findMany({
          where: { classId: selectedClass.id, date },
          include: {
            entries: { where: { studentId: { in: studentIds } } },
            subject: { select: { name: true } },
          },
          orderBy: { period: "asc" },
        }),
      ])
    : [[], []];

  const summaryMap = new Map(summaries.map((s) => [s.studentId, s.status]));
  const entryMap = new Map<string, Map<number, string>>();
  for (const s of sessions)
    for (const e of s.entries) {
      if (!entryMap.has(e.studentId)) entryMap.set(e.studentId, new Map());
      entryMap.get(e.studentId)!.set(s.period, e.status);
    }
  const periods = sessions.map((s) => ({ period: s.period, subject: s.subject.name }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="سجلات الحضور" subtitle="تصفح حضور الصفوف يوماً بيوم وحصة بحصة" />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-600">
            الصف
            <select
              name="class" defaultValue={classId} required
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">اختر…</option>
              {classes.map((c: ClassGroup) => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-600">
            التاريخ
            <input
              name="date" type="date" defaultValue={dateStr}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
            عرض
          </button>
        </form>
      </Card>

      {selectedClass && (
        <Card className="overflow-x-auto">
          <h2 className="mb-3 flex flex-wrap items-center gap-2 font-bold text-slate-800">
            <Icon.attendance className="h-5 w-5 text-brand-600" />
            {selectedClass.displayName} — <span dir="ltr">{dateStr}</span>
            <Badge tone="brand">{roster.length} طالب</Badge>
            <Badge tone="slate">{sessions.length} حصة</Badge>
          </h2>
          {roster.length === 0 ? (
            <EmptyState icon="students" title="لا طلاب في هذا الصف" />
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">الطالب</th>
                  <th className="text-start font-semibold">حالة اليوم</th>
                  {periods.map((p) => (
                    <th key={p.period} className="px-1 text-center font-semibold">
                      حصة {p.period}
                      <div className="text-[10px] font-normal text-slate-400">{p.subject}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((
                  e: Prisma.EnrollmentGetPayload<{ include: { student: { select: { id: true; fullName: true } } } }>,
                  i: number,
                ) => {
                  const st = summaryMap.get(e.studentId);
                  const stInfo = st ? STATUS[st] : null;
                  const per = entryMap.get(e.studentId);
                  return (
                    <tr key={e.studentId} className="border-t border-slate-50">
                      <td className="py-2.5 pe-2">
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-300">{i + 1}</span>
                          <span className="font-medium text-slate-800">{e.student.fullName}</span>
                        </span>
                      </td>
                      <td>
                        {stInfo
                          ? <Badge tone={stInfo.tone}>{stInfo.label}</Badge>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      {periods.map((p) => {
                        const st2 = per?.get(p.period);
                        const cell = st2 ? ENTRY[st2] : null;
                        return (
                          <td key={p.period} className="text-center">
                            {cell ? (
                              <span
                                title={st2}
                                className={`inline-grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${cell.cls}`}
                              >
                                {cell.label}
                              </span>
                            ) : (
                              <span className="text-slate-200">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!selectedClass && (
        <EmptyState icon="attendance" title="اختر صفاً لعرض سجلاته" hint="حدد الصف والتاريخ من الأعلى" />
      )}
    </div>
  );
}

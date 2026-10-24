import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { DAY_NAMES } from "@app/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * صفحة المعلم التفصيلية — ملفه + جدوله الأسبوعي الساري + إحصاءات حمله.
 * الحمل الفعلي يُحسب من خانات الجدول المنشورة مقابل نصابه التعاقدي.
 */
export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;

  const [teacher, year, settings, dayDefs] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: { include: { unavailabilities: true } } },
    }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    prisma.dayPeriodDef.findMany({ orderBy: { index: "asc" } }),
  ]);
  if (!teacher || teacher.role !== "teacher") notFound();
  const profile = teacher.teacherProfile;

  const [slots, assignments] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { teacherId: teacher.id, effectiveTo: null },
      include: { class: true, subject: true },
      orderBy: [{ weekday: "asc" }, { period: "asc" }],
    }),
    prisma.teachingAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true, ...(year ? { academicYearId: year.id } : {}) },
      include: { class: true, subject: true },
    }),
  ]);

  const weekDays = (settings?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort();
  // فترات الدروس لكل يوم (بلا استراحات) → عدد الأعمدة الأقصى
  const lessonsOf = (d: number) => dayDefs.filter((p) => p.dayOfWeek === d && !p.isBreak);
  const maxPeriods = Math.max(1, ...weekDays.map((d) => lessonsOf(d).length));

  const slotAt = (day: number, period: number) =>
    slots.find((s) => s.weekday === day && s.period === period);
  const dayLoad = weekDays.map((d) => ({
    day: d,
    count: slots.filter((s) => s.weekday === d).length,
    lessons: lessonsOf(d).length,
  }));
  const weeklyLoad = slots.length;
  const quota = profile?.weeklyLessons ?? 0;
  const loadPct = quota > 0 ? Math.round((weeklyLoad / quota) * 100) : 0;

  const bySubject = new Map<string, { name: string; color: string | null; count: number }>();
  const classSet = new Map<string, string>();
  for (const s of slots) {
    const k = s.subject.name;
    bySubject.set(k, { name: k, color: s.subject.color, count: (bySubject.get(k)?.count ?? 0) + 1 });
    classSet.set(s.classId, s.class.displayName);
  }
  const unavailableSet = new Set(profile?.unavailabilities.map((u) => `${u.dayOfWeek}|${u.periodIndex}`) ?? []);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/users/teachers" className="mb-2 inline-block text-xs font-bold text-brand-600 hover:underline">
        ← المعلمون
      </Link>
      <PageHeader
        title={teacher.name}
        subtitle={`${teacher.username ?? ""} · ${profile?.specialization ?? profile?.defaultSubject ?? "بلا تخصص"}${teacher.isActive ? "" : " · موقوف"}`}
      />

      {/* بطاقة الحمل */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card className="!p-4 text-center">
          <p className="text-3xl font-bold text-brand-600">{weeklyLoad}</p>
          <p className="text-xs text-slate-500">حصة مجدولة/أسبوع</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-3xl font-bold text-slate-700">{quota || "—"}</p>
          <p className="text-xs text-slate-500">النصاب التعاقدي</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className={`text-3xl font-bold ${loadPct > 100 ? "text-red-600" : loadPct >= 90 ? "text-amber-600" : "text-emerald-600"}`}>
            {quota ? `${loadPct}%` : "—"}
          </p>
          <p className="text-xs text-slate-500">نسبة الحمل</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-3xl font-bold text-slate-700">{classSet.size}</p>
          <p className="text-xs text-slate-500">شعبة يدرّسها</p>
        </Card>
      </div>

      {/* الجدول الأسبوعي */}
      <Card className="mb-4">
        <h2 className="mb-3 font-bold text-slate-800">جدوله الأسبوعي</h2>
        {slots.length === 0 ? (
          <p className="text-sm text-slate-400">لا حصص مجدولة حالياً.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 p-1.5 text-start font-bold text-slate-500">اليوم</th>
                  {Array.from({ length: maxPeriods }, (_, i) => (
                    <th key={i} className="border border-slate-200 bg-slate-50 p-1.5 font-bold text-slate-500">ح{i + 1}</th>
                  ))}
                  <th className="border border-slate-200 bg-slate-50 p-1.5 font-bold text-slate-500">مجموع</th>
                </tr>
              </thead>
              <tbody>
                {weekDays.map((d) => {
                  const load = dayLoad.find((x) => x.day === d)!;
                  const overDaily = profile?.maxDailyLessons && load.count > profile.maxDailyLessons;
                  return (
                    <tr key={d}>
                      <td className="border border-slate-200 bg-slate-50 p-1.5 font-bold text-slate-700 whitespace-nowrap">
                        {DAY_NAMES[d]}
                      </td>
                      {Array.from({ length: maxPeriods }, (_, i) => {
                        const s = slotAt(d, i + 1);
                        // رقم الحصة التسلسلي → فهرس الخانة الأصلي (periodIndex في الإتاحة)
                        const defIndex = lessonsOf(d)[i]?.index;
                        const blocked = defIndex !== undefined && unavailableSet.has(`${d}|${defIndex}`);
                        if (i + 1 > lessonsOf(d).length)
                          return <td key={i} className="border border-slate-200 bg-slate-100/50" />;
                        if (s)
                          return (
                            <td key={i} className="border border-slate-200 p-1 text-center">
                              <span className="block rounded px-1 py-0.5 text-white" style={{ backgroundColor: s.subject.color ?? "#64748b" }}>
                                {s.subject.name}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-slate-500">{s.class.displayName}</span>
                            </td>
                          );
                        return (
                          <td key={i} className={`border border-slate-200 text-center ${blocked ? "bg-red-50 text-red-300" : "text-slate-200"}`}>
                            {blocked ? "✕" : "·"}
                          </td>
                        );
                      })}
                      <td className={`border border-slate-200 p-1.5 text-center font-bold ${overDaily ? "text-red-600" : "text-slate-600"}`}>
                        {load.count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-400">
              ✕ أحمر = خانة غير متاحة بحسب ملفه · عمود المجموع يحمرّ إن تجاوز حدّه اليومي ({profile?.maxDailyLessons ?? "—"}).
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* توزيع المواد */}
        <Card>
          <h2 className="mb-3 font-bold text-slate-800">الحصص حسب المادة</h2>
          {bySubject.size === 0 ? (
            <p className="text-sm text-slate-400">لا حصص مجدولة.</p>
          ) : (
            <ul className="space-y-2">
              {[...bySubject.values()].sort((a, b) => b.count - a.count).map((x) => (
                <li key={x.name} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: x.color ?? "#64748b" }} />
                  <span className="flex-1 font-medium text-slate-700">{x.name}</span>
                  <Badge tone="slate">{x.count} حصة</Badge>
                </li>
              ))}
            </ul>
          )}
          {classSet.size > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-bold text-slate-500">الشعب ({classSet.size})</p>
              <div className="flex flex-wrap gap-1">
                {[...classSet.values()].sort().map((n) => (
                  <span key={n} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{n}</span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* الملف والقيود */}
        <Card>
          <h2 className="mb-3 font-bold text-slate-800">ملف الجدولة والقيود</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-400">التخصص</dt><dd className="font-medium text-slate-700">{profile?.specialization ?? "—"}</dd>
            <dt className="text-slate-400">الرقم الوظيفي</dt><dd className="font-medium text-slate-700" dir="ltr">{profile?.employeeNo ?? "—"}</dd>
            <dt className="text-slate-400">حد اليومي</dt><dd className="font-medium text-slate-700">{profile?.maxDailyLessons ?? "—"}</dd>
            <dt className="text-slate-400">متتالية قصوى</dt><dd className="font-medium text-slate-700">{profile?.maxConsecutive ?? "—"}</dd>
            <dt className="text-slate-400">أيام عمل قصوى</dt><dd className="font-medium text-slate-700">{profile?.maxWorkingDays ?? "—"}</dd>
            <dt className="text-slate-400">يتجنب الأخيرة</dt><dd className="font-medium text-slate-700">{profile?.avoidLastPeriod ? "نعم" : "لا"}</dd>
          </dl>
          {assignments.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-bold text-slate-500">الإسنادات النشطة ({assignments.length})</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.subject.color ?? "#94a3b8" }} />
                    {a.subject.name} — {a.class.displayName}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

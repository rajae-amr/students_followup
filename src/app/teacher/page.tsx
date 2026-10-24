import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { lessonsForTeacher, schoolToday, schoolTimezone, weekStartOf, DAY_NAMES } from "@app/core";
import { OpenSessionButton } from "./open-session-button";
import { Card, NavCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export default async function TeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireRole("teacher");
  const today = schoolToday(await schoolTimezone());
  const { date: dateParam } = await searchParams;

  // التنقل بالأيام — ?date=YYYY-MM-DD؛ الافتراضي اليوم
  const parsed = dateParam ? new Date(`${dateParam}T12:00:00Z`) : null;
  const viewing = parsed && !isNaN(parsed.getTime()) ? parsed : today;
  const isToday = iso(viewing) === iso(today);
  const weekday = viewing.getUTCDay();

  const prev = new Date(viewing); prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(viewing); next.setUTCDate(next.getUTCDate() + 1);

  const [lessons, user, settings, dayDefs, weekSlots, duties] = await Promise.all([
    lessonsForTeacher(actor, viewing),
    prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } }),
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    prisma.dayPeriodDef.findMany({ where: { dayOfWeek: weekday, isBreak: false }, orderBy: { index: "asc" } }),
    prisma.timetableSlot.findMany({
      where: { teacherId: actor.userId, effectiveTo: null },
      include: { subject: { select: { name: true, color: true } }, class: { select: { displayName: true } } },
      orderBy: [{ weekday: "asc" }, { period: "asc" }],
    }),
    prisma.dutyAssignment.findMany({
      where: { teacherId: actor.userId, weekStart: weekStartOf(viewing) },
      include: { location: { select: { name: true } } },
      orderBy: { dayOfWeek: "asc" },
    }),
  ]);

  // رقم الحصة التسلسلي → تعريفها (وقت/تسمية)
  const periodInfo = (p: number) => dayDefs[p - 1];

  // شريط الأسبوع: أيام الدوام من بداية أسبوع التاريخ المعروض
  const weekDays = (settings?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort();
  const wStart = weekStartOf(viewing);
  const weekStrip = weekDays.map((d) => {
    const day = new Date(wStart);
    // weekStartOf يعيد بداية الأسبوع؛ نوافق بين التاريخ ويوم الأسبوع
    while (day.getUTCDay() !== d) day.setUTCDate(day.getUTCDate() + 1);
    const count = weekSlots.filter((s) => s.weekday === d).length;
    return { d, date: day, count };
  });

  // حالة خطط هذا الأسبوع: مسلّمة من أصل التكليفات النشطة
  const wk = weekStartOf(today);
  const [planCount, assignCount] = await Promise.all([
    prisma.weeklyPlan.count({ where: { teacherId: actor.userId, weekStart: wk, status: "submitted" } }),
    prisma.teachingAssignment.count({
      where: { teacherId: actor.userId, isActive: true, academicYear: { isCurrent: true } },
    }),
  ]);

  const dayAr = viewing.toLocaleDateString("ar", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "UTC",
  });
  const firstName = user?.name?.split(" ")[0] ?? "معلم";

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">مرحباً أ. {firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">{dayAr}</p>
      </header>

      {/* تنقّل بالأيام */}
      <nav className="mb-5 flex items-center justify-between rounded-2xl bg-white p-2 shadow-soft ring-1 ring-slate-100">
        <Link href={`/teacher?date=${iso(prev)}`}
          className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50 hover:text-brand-600">
          ← {DAY_NAMES[prev.getUTCDay()]}
        </Link>
        {!isToday ? (
          <Link href="/teacher" className="rounded-xl bg-brand-50 px-4 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100">
            العودة لليوم
          </Link>
        ) : (
          <span className="text-xs font-bold text-brand-700">اليوم</span>
        )}
        <Link href={`/teacher?date=${iso(next)}`}
          className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50 hover:text-brand-600">
          {DAY_NAMES[next.getUTCDay()]} →
        </Link>
      </nav>

      {/* مناوباتي هذا الأسبوع */}
      {duties.length > 0 && (
        <section aria-label="مناوباتي" className="mb-5">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-accent-50 p-3 ring-1 ring-accent-200">
            <span className="text-sm font-bold text-accent-700">📋 مناوباتي:</span>
            {duties.map((d) => (
              <span key={d.id} className={`rounded-xl px-3 py-1.5 text-xs font-bold ring-1 ${
                d.dayOfWeek === weekday
                  ? "bg-accent-600 text-white ring-accent-600"
                  : "bg-white text-accent-700 ring-accent-200"
              }`}>
                {DAY_NAMES[d.dayOfWeek]} — {d.location.name}
              </span>
            ))}
          </div>
        </section>
      )}

      <section aria-label={`حصص ${DAY_NAMES[weekday]}`}>
        <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
          <Icon.schedule className="h-5 w-5 text-brand-600" />
          حصص {DAY_NAMES[weekday]}
          <Badge tone="brand">{lessons.length}</Badge>
          {!isToday && <Badge tone="slate">عرض فقط</Badge>}
        </h2>

        {lessons.length === 0 ? (
          <EmptyState
            icon="schedule"
            title={isToday ? "لا حصص مسندة إليك اليوم" : `لا حصص يوم ${DAY_NAMES[weekday]}`}
            hint={isToday ? "ستظهر حصصك المجدولة هنا عند إسنادها من الإدارة" : "تنقّل بين الأيام بالأزرار أعلاه"}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {lessons.map((l) => {
              const done = l.sessionStatus === "submitted";
              const pct = l.rosterCount ? Math.round((l.recordedCount / l.rosterCount) * 100) : 0;
              const info = periodInfo(l.period);
              return (
                <li key={l.slotId}>
                  <Card className={`flex h-full flex-col justify-between p-5 ${done ? "opacity-80" : ""}`}>
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">الحصة {l.period} — {l.subjectName}</p>
                        <p className="mt-0.5 text-sm text-slate-500">{l.className}</p>
                        {info?.start && (
                          <p className="mt-0.5 text-xs text-slate-400" dir="ltr">{info.start} – {info.end}</p>
                        )}
                      </div>
                      {done ? (
                        <Badge tone="emerald"><Icon.check className="h-3.5 w-3.5" /> معتمدة</Badge>
                      ) : (
                        <Badge tone={pct === 100 ? "emerald" : pct > 0 ? "amber" : "slate"}>
                          {l.sessionId ? "قيد الرصد" : "لم تبدأ"}
                        </Badge>
                      )}
                    </div>

                    <div className="mb-4">
                      <div className="mb-1 flex justify-between text-xs text-slate-500">
                        <span>مرصود {l.recordedCount} من {l.rosterCount}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all ${done || pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`}
                          style={{ width: `${done ? 100 : pct}%` }}
                        />
                      </div>
                    </div>

                    {isToday && !done && (
                      <OpenSessionButton slotId={l.slotId} dateISO={viewing.toISOString()} sessionId={l.sessionId} />
                    )}
                    {!isToday && l.sessionId && (
                      <Link href={`/teacher/session/${l.sessionId}`}
                        className="rounded-xl bg-slate-100 px-4 py-2 text-center text-sm font-bold text-slate-600 transition hover:bg-slate-200">
                        عرض الكشف
                      </Link>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* جدولي الأسبوعي */}
      <section className="mt-8" aria-label="جدولي الأسبوعي">
        <h2 className="mb-4 font-bold text-slate-800">جدولي هذا الأسبوع</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {weekStrip.map(({ d, date, count }) => {
            const active = iso(date) === iso(viewing);
            return (
              <Link
                key={d}
                href={`/teacher?date=${iso(date)}`}
                className={`rounded-2xl p-3 text-center ring-1 transition ${
                  active
                    ? "bg-brand-600 text-white ring-brand-600"
                    : iso(date) === iso(today)
                      ? "bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100"
                      : "bg-white text-slate-600 ring-slate-100 hover:ring-brand-200"
                }`}
              >
                <p className="text-xs font-bold">{DAY_NAMES[d]}</p>
                <p className={`mt-0.5 text-lg font-bold ${active ? "text-white" : ""}`}>{count}</p>
                <p className={`text-[10px] ${active ? "text-brand-100" : "text-slate-400"}`}>حصة</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8" aria-label="أدوات أخرى">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
          أدوات المتابعة
          {assignCount > 0 && (
            <Badge tone={planCount >= assignCount ? "emerald" : "amber"}>
              الخطة الأسبوعية: {planCount}/{assignCount} مسلّمة
            </Badge>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <NavCard href="/teacher/grades" title="الدرجات" subtitle="تقييمات ورصد درجات" icon="grades" />
          <NavCard href="/teacher/evaluation" title="التقييم الدوري" subtitle="بنود المتابعة الأسبوعية" icon="evaluation" iconClass="bg-accent-50 text-accent-700" />
          <NavCard href="/teacher/plan" title="الخطة الأسبوعية" subtitle="تحضير الدروس وطباعتها" icon="book" iconClass="bg-violet-50 text-violet-600" />
          <NavCard href="/absence" title="تنبيهات الغياب" subtitle="إشعار أولياء الأمور" icon="bell" iconClass="bg-red-50 text-red-600" />
        </div>
      </section>
    </div>
  );
}

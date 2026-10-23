import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { lessonsForTeacher, schoolToday, schoolTimezone } from "@app/core";
import { OpenSessionButton } from "./open-session-button";
import { Card, NavCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

export default async function TeacherPage() {
  const actor = await requireRole("teacher");
  const today = schoolToday(await schoolTimezone());
  const [lessons, user] = await Promise.all([
    lessonsForTeacher(actor, today),
    prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } }),
  ]);

  const dayAr = today.toLocaleDateString("ar", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const firstName = user?.name?.split(" ")[0] ?? "معلم";

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          مرحباً أ. {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{dayAr}</p>
      </header>

      <section aria-label="حصص اليوم">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
          <Icon.schedule className="h-5 w-5 text-brand-600" />
          حصص اليوم
          <Badge tone="brand">{lessons.length}</Badge>
        </h2>

        {lessons.length === 0 ? (
          <EmptyState
            icon="schedule"
            title="لا حصص مسندة إليك اليوم"
            hint="ستظهر حصصك المجدولة هنا عند إسنادها من الإدارة"
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {lessons.map((l) => {
              const done = l.sessionStatus === "submitted";
              const pct = l.rosterCount ? Math.round((l.recordedCount / l.rosterCount) * 100) : 0;
              return (
                <li key={l.slotId}>
                  <Card className={`flex h-full flex-col justify-between p-5 ${done ? "opacity-80" : ""}`}>
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">
                          الحصة {l.period} — {l.subjectName}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-500">{l.className}</p>
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

                    {!done && (
                      <OpenSessionButton
                        slotId={l.slotId}
                        dateISO={today.toISOString()}
                        sessionId={l.sessionId}
                      />
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-label="أدوات أخرى">
        <h2 className="mb-4 font-bold text-slate-800">أدوات المتابعة</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <NavCard href="/teacher/grades" title="الدرجات" subtitle="تقييمات ورصد درجات" icon="grades" />
          <NavCard href="/teacher/evaluation" title="التقييم الدوري" subtitle="بنود المتابعة الأسبوعية" icon="evaluation" iconClass="bg-accent-50 text-accent-700" />
          <NavCard href="/absence" title="تنبيهات الغياب" subtitle="إشعار أولياء الأمور" icon="bell" iconClass="bg-red-50 text-red-600" />
        </div>
      </section>
    </div>
  );
}

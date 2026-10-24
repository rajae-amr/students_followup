import { prisma } from "@app/db";
import { schoolTodayStr, schoolTimezone } from "@app/core";
import { requirePerm, getStaffPerms } from "@/server/session";
import { sendAbsenceAlert } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { AppShell } from "@/components/app-shell";
import { linksFor } from "@/components/nav-links";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import type { Prisma } from "@prisma/client";

const STATUS: Record<string, { label: string; tone: "red" | "amber" | "violet" | "slate" }> = {
  absent: { label: "غائب", tone: "red" },
  excused: { label: "غائب بعذر", tone: "amber" },
  partial: { label: "غياب جزئي", tone: "violet" },
  late: { label: "متأخر", tone: "slate" },
};

/** غائبو اليوم — المعلم يرى طلاب حصصه، الإدارة ترى الكل */
export default async function AbsencePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requirePerm("attendance", "teacher");
  const { date: dateParam } = await searchParams;
  const dateStr = dateParam ?? schoolTodayStr(await schoolTimezone());
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  const staffPerms = actor.role === "staff" ? await getStaffPerms(actor.userId) : [];
  const [summaries, user] = await Promise.all([
    prisma.dailySummary.findMany({
      where: {
        date,
        status: { in: ["absent", "excused"] },
        student: { isActive: true },
        // المعلم يرى فقط طلاباً سجّل لهم حضوراً هذا اليوم
        ...(actor.role === "teacher"
          ? {
              student: {
                attendanceEntries: {
                  some: { lessonSession: { date, teacherId: actor.userId } },
                },
              },
            }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true, fullName: true,
            guardians: { where: { verified: true }, select: { id: true } },
          },
        },
      },
      orderBy: { student: { fullName: "asc" } },
    }),
    prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } }),
  ]);

  // التنبيهات المرسلة/المعلّقة لهذا اليوم — لتفادي التكرار البصري
  const sent = await prisma.outboxEvent.findMany({
    where: { type: "absence_alert" },
    select: { payload: true, status: true },
  });
  const alerted = new Set(
    sent
      .filter((e: (typeof sent)[number]) => (e.payload as { date?: string }).date === dateStr && e.status !== "cancelled")
      .map((e: (typeof sent)[number]) => (e.payload as { studentId: string }).studentId),
  );

  return (
    <AppShell
      userName={user?.name ?? ""}
      role={actor.role}
      links={
        actor.role === "staff"
          ? linksFor("staff").filter((l) => l.perm === "dashboard" || staffPerms.includes(l.perm as never))
          : linksFor(actor.role)
      }
    >
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="تنبيهات الغياب"
          subtitle="إشعار أولياء أمور الغائبين — إرسال واحد لكل طالب يومياً"
        />

        <Card className="mb-4">
          <form method="get" className="flex items-end gap-3">
            <label className="text-sm font-medium text-slate-600">التاريخ
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

        {!summaries.length ? (
          <EmptyState
            icon="check"
            title={`لا غياب مسجل في ${dateStr}`}
            hint="كل الطلاب حاضرون في هذا اليوم"
          />
        ) : (
          <ul className="space-y-2">
            {summaries.map((
              s: Prisma.DailySummaryGetPayload<{
                include: { student: { select: { id: true; fullName: true; guardians: { select: { id: true } } } } };
              }>,
            ) => {
              const st = STATUS[s.status] ?? { label: s.status, tone: "slate" as const };
              return (
                <li key={s.id}>
                  <Card className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-10 w-10 place-items-center rounded-xl ${
                        s.status === "absent" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                      }`}>
                        <Icon.warning className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-bold text-slate-800">{s.student.fullName}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {s.student.guardians.length
                            ? `${s.student.guardians.length} ولي أمر موثق`
                            : "لا ولي أمر موثق"}
                        </p>
                      </div>
                    </div>
                    {alerted.has(s.studentId) ? (
                      <Badge tone="emerald">
                        <Icon.check className="h-3.5 w-3.5" />
                        أُرسل/مُدرج
                      </Badge>
                    ) : s.student.guardians.length ? (
                      <FormWithResult action={sendAbsenceAlert} submitLabel="إرسال تنبيه" bare>
                        <input type="hidden" name="studentId" value={s.studentId} />
                        <input type="hidden" name="date" value={dateStr} />
                      </FormWithResult>
                    ) : (
                      <span className="text-xs text-slate-400">لا قناة</span>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

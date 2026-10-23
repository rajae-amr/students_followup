import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { DAY_STATUS_AR, BEHAVIOR_AR } from "@app/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const DAY_TONE: Record<string, "emerald" | "red" | "amber" | "violet" | "slate"> = {
  present: "emerald",
  absent: "red",
  partial: "amber",
  excused: "amber",
  late: "violet",
};

export default async function ParentPage() {
  const actor = await requireRole("guardian");

  const profile = await prisma.guardianProfile.findUnique({
    where: { userId: actor.userId },
    include: {
      children: {
        where: { verified: true, student: { isActive: true } },
        include: {
          student: {
            include: {
              enrollments: {
                take: 1,
                include: { class: { select: { displayName: true, name: true } } },
              },
              dailySummaries: {
                orderBy: { date: "desc" },
                take: 7,
              },
              // آخر مؤشرات للبطاقة — المصرّح للأهل فقط
              behaviorEntries: {
                where: { audience: "family" },
                orderBy: { date: "desc" },
                take: 1,
              },
              grades: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                include: { assessment: { include: { subject: true } } },
              },
            },
          },
        },
      },
    },
  });

  const children = profile?.children ?? [];

  // إشعارات البوابة — تنبيهات الغياب والتقارير التي وُجّهت لهذه القناة
  const alerts = profile
    ? await prisma.outboxEvent.findMany({
        where: {
          channel: "portal",
          status: "done",
          type: { in: ["absence_alert", "report_send", "weekly_digest"] },
          payload: { path: ["guardianId"], equals: profile.id },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : [];

  const ALERT_LABEL: Record<string, string> = {
    absence_alert: "تنبيه غياب",
    report_send: "تقرير مدرسي",
    weekly_digest: "التقرير الأسبوعي",
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="أبنائي" subtitle="متابعة حضور وسلوك أبنائك المرتبطين بحسابك" />

      {alerts.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-800">
            <Icon.bell className="h-5 w-5 text-accent-600" />
            الإشعارات
          </h2>
          <ul className="divide-y divide-slate-100">
            {alerts.map((a) => {
              const p = a.payload as {
                studentId?: string;
                studentName?: string;
                date?: string;
                status?: string;
              };
              const student = children.find((c) => c.student.id === p.studentId)?.student;
              const href = student ? `/parent/student/${student.id}` : "/parent";
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={href} className="flex items-center gap-2 hover:text-brand-700">
                    <Badge tone={a.type === "absence_alert" ? "red" : "brand"}>
                      {ALERT_LABEL[a.type] ?? a.type}
                    </Badge>
                    <span className="text-slate-700">
                      {p.studentName ?? student?.fullName ?? "أبناؤك"}
                      {p.date ? ` — ${p.date}` : ""}
                    </span>
                  </Link>
                  <span className="shrink-0 text-xs text-slate-400">
                    {a.createdAt.toLocaleDateString("ar", { day: "numeric", month: "short" })}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {children.length === 0 ? (
        <EmptyState
          icon="parent"
          title="لا أبناء مرتبطين بحسابك بعد"
          hint="راجع إدارة المدرسة لربط حسابك بأبنائك"
        />
      ) : (
        <ul className="space-y-4">
          {children.map(({ student }) => {
            const latest = student.dailySummaries[0];
            return (
              <li key={student.id}>
                <Link href={`/parent/student/${student.id}`} className="block">
                  <Card className="p-5 transition hover:shadow-lift hover:ring-brand-200">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 font-bold text-brand-600">
                          {student.fullName.slice(0, 2)}
                        </span>
                        <div>
                          <h2 className="font-bold text-slate-800">{student.fullName}</h2>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">
                            {student.enrollments[0]?.class.displayName ??
                              student.enrollments[0]?.class.name ??
                              "غير مسجل بصف"}
                          </p>
                          {latest && (
                            <p className="mt-0.5 text-xs text-slate-400">
                              آخر يوم: {latest.date.toLocaleDateString("ar", { weekday: "long" })}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                        التفاصيل
                        <Icon.arrowBack className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                      {student.dailySummaries.length === 0 ? (
                        <span className="text-sm text-slate-400">لا سجلات حضور بعد</span>
                      ) : (
                        student.dailySummaries.map((d) => (
                          <Badge
                            key={d.id}
                            tone={DAY_TONE[d.status] ?? "slate"}
                          >
                            {d.date.toLocaleDateString("ar", { weekday: "short" })}: {DAY_STATUS_AR[d.status]}
                          </Badge>
                        ))
                      )}
                    </div>

                    {/* مؤشرات سريعة: آخر سلوك وآخر درجة */}
                    {(student.behaviorEntries[0] || student.grades[0]) && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        {student.behaviorEntries[0]?.category && (
                          <Badge
                            tone={
                              student.behaviorEntries[0].category === "excellent"
                                ? "emerald"
                                : student.behaviorEntries[0].category === "needs_followup"
                                  ? "amber"
                                  : "brand"
                            }
                          >
                            آخر سلوك: {BEHAVIOR_AR[student.behaviorEntries[0].category as keyof typeof BEHAVIOR_AR]}
                          </Badge>
                        )}
                        {student.grades[0]?.score != null && (
                          <Badge tone="slate">
                            آخر درجة: {student.grades[0].assessment.subject.name}{" "}
                            {student.grades[0].score}/{student.grades[0].assessment.maxScore}
                          </Badge>
                        )}
                      </div>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

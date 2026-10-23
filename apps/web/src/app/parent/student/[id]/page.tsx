import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { DAY_STATUS_AR, LESSON_STATUS_AR, BEHAVIOR_AR, academicStats } from "@app/core";
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
const ENTRY_TONE: Record<string, "emerald" | "red" | "amber" | "violet"> = {
  present: "emerald",
  absent: "red",
  excused: "amber",
  late: "violet",
};
const BEHAVIOR_TONE: Record<string, "emerald" | "brand" | "amber"> = {
  excellent: "emerald",
  committed: "brand",
  needs_followup: "amber",
};
const KIND_AR: Record<string, string> = {
  quiz: "اختبار قصير",
  homework: "واجب",
  exam: "اختبار",
  participation: "مشاركة",
};
const NOTE_CAT_AR: Record<string, string> = {
  positive: "إيجابية",
  absence: "غياب",
  behavior: "سلوك",
  free: "عامة",
};
const NOTE_TONE: Record<string, "emerald" | "amber" | "violet" | "slate"> = {
  positive: "emerald",
  absence: "amber",
  behavior: "violet",
};

export default async function StudentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole("guardian");
  const { id } = await params;

  // التحقق: الطالب مرتبط بولي الأمر الحالي فقط — لا IDOR
  const profile = await prisma.guardianProfile.findUnique({
    where: { userId: actor.userId },
  });
  const link = profile
    ? await prisma.guardianStudent.findUnique({
        where: {
          guardianId_studentId: { guardianId: profile.id, studentId: id },
        },
      })
    : null;
  if (!link?.verified) notFound();

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      enrollments: {
        take: 1,
        include: { class: { select: { displayName: true, name: true } } },
      },
      dailySummaries: { orderBy: { date: "desc" }, take: 30 },
      attendanceEntries: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          lessonSession: { include: { subject: true } },
        },
      },
      // فقط ما هو مصرَّح للأهل — السجلات الداخلية لا تُعرض أبداً
      behaviorEntries: {
        where: { audience: "family" },
        orderBy: { date: "desc" },
        take: 20,
        include: { lessonSession: { include: { subject: true } } },
      },
      notes: {
        where: { audience: "family" },
        orderBy: { date: "desc" },
        take: 20,
      },
      grades: {
        orderBy: { updatedAt: "desc" },
        take: 30,
        include: { assessment: { include: { subject: true } } },
      },
      evaluations: {
        orderBy: [{ weekStart: "desc" }, { updatedAt: "desc" }],
        take: 60,
        include: { subject: true },
      },
    },
  });
  if (!student) notFound();

  // التقارير المدرسية المعتمدة المُرسلة إليه — قناة البوابة والتيليجرام معاً
  const snapshots = await prisma.reportSnapshot.findMany({
    where: { studentId: id, status: "sent" },
    orderBy: { approvedAt: "desc" },
    take: 12,
    select: {
      id: true,
      rangeStart: true,
      rangeEnd: true,
      approvedAt: true,
    },
  });
  const viewed = snapshots.length
    ? await prisma.reportViewEvent.findMany({
        where: {
          reportSnapshotId: { in: snapshots.map((s) => s.id) },
          viewerUserId: actor.userId,
        },
        select: { reportSnapshotId: true },
      })
    : [];
  const viewedIds = new Set(viewed.map((v) => v.reportSnapshotId));

  const presentDays = student.dailySummaries.filter((d) => d.status === "present").length;
  const absentDays = student.dailySummaries.filter((d) => d.status === "absent").length;
  const behaviorCount = student.behaviorEntries.length;
  const lastGrade = student.grades.find((g) => g.score != null);

  // الدرجة الأكاديمية والتقدير محسوبان من درجات الاختبارات لكل مادة
  const statsBySubject = new Map<string, { pct: number; letter: string }>();
  {
    const bySubj = new Map<string, { score: number | null; max: number; kind: string }[]>();
    for (const g of student.grades) {
      const key = g.assessment.subject.name;
      bySubj.set(key, [
        ...(bySubj.get(key) ?? []),
        { score: g.score, max: g.assessment.maxScore, kind: g.assessment.kind },
      ]);
    }
    for (const [k, items] of bySubj) {
      const s = academicStats(items);
      if (s) statsBySubject.set(k, s);
    }
  }

  // تجميع التقييمات اليدوية حسب المادة — أحدث قيمة أسبوعية لكل بند
  type EvalRow = { category: string; value: string; weekStart: Date | null };
  const evalsBySubject = new Map<string, EvalRow[]>();
  {
    const seen = new Set<string>();
    for (const e of student.evaluations) {
      const subj = e.subject?.name ?? "عام";
      const key = `${subj}|${e.category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evalsBySubject.set(subj, [
        ...(evalsBySubject.get(subj) ?? []),
        { category: e.category, value: e.value, weekStart: e.weekStart },
      ]);
    }
  }
  const LETTER_TONE: Record<string, "emerald" | "brand" | "amber" | "red"> = {
    A: "emerald", B: "brand", C: "amber", D: "amber", F: "red",
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/parent"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <Icon.arrowBack className="h-4 w-4" />
        أبنائي
      </Link>

      <PageHeader
        title={student.fullName}
        subtitle={[
          student.enrollments[0]?.class.displayName ??
            student.enrollments[0]?.class.name ??
            null,
          student.dailySummaries.length
            ? `${presentDays} يوم حضور من آخر ${student.dailySummaries.length} سجلات`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined}
      />

      {/* ملخص سريع */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "أيام حضور", value: presentDays, cls: "bg-emerald-50 text-emerald-700", icon: "✅" },
          { label: "أيام غياب", value: absentDays, cls: absentDays ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-500", icon: "❌" },
          { label: "ملاحظات سلوك", value: behaviorCount, cls: "bg-brand-50 text-brand-700", icon: "🗒️" },
          {
            label: "آخر درجة",
            value: lastGrade ? `${lastGrade.score}/${lastGrade.assessment.maxScore}` : "—",
            cls: "bg-accent-50 text-accent-700",
            icon: "📊",
          },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl px-3 py-3 ring-1 ring-slate-100 ${s.cls}`}>
            <p className="text-xs font-medium opacity-80">{s.icon} {s.label}</p>
            <p className="mt-1 text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* التقارير المدرسية المرسلة */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.reports className="h-5 w-5 text-brand-600" />
          التقارير المدرسية
          {snapshots.some((s) => !viewedIds.has(s.id)) && (
            <Badge tone="accent">جديد</Badge>
          )}
        </h2>
        {snapshots.length === 0 ? (
          <EmptyState
            icon="reports"
            title="لا تقارير مرسلة بعد"
            hint="ستظهر هنا التقارير الأسبوعية وأي تقرير تعتمده الإدارة"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {snapshots.map((s) => {
              const isNew = !viewedIds.has(s.id);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">
                      تقرير الفترة{" "}
                      <span dir="ltr">
                        {s.rangeStart.toLocaleDateString("en-CA")} ← {s.rangeEnd.toLocaleDateString("en-CA")}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      أُرسل {s.approvedAt?.toLocaleDateString("ar")}
                    </p>
                  </div>
                  <Link
                    href={`/parent/student/${id}/report/${s.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100"
                  >
                    {isNew ? <Badge tone="accent">جديد</Badge> : null}
                    عرض التقرير
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* الحضور اليومي */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.attendance className="h-5 w-5 text-brand-600" />
          الحضور اليومي
          <Badge tone="slate">آخر 30 يوماً</Badge>
        </h2>
        {student.dailySummaries.length === 0 ? (
          <EmptyState icon="attendance" title="لا سجلات بعد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">التاريخ</th>
                  <th className="text-start font-semibold">الحالة</th>
                  <th className="text-center font-semibold">غياب</th>
                  <th className="text-center font-semibold">استئذان</th>
                  <th className="text-center font-semibold">تأخير</th>
                </tr>
              </thead>
              <tbody>
                {student.dailySummaries.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 text-slate-600">{d.date.toLocaleDateString("ar")}</td>
                    <td>
                      <Badge tone={DAY_TONE[d.status] ?? "slate"}>
                        {DAY_STATUS_AR[d.status]}
                      </Badge>
                    </td>
                    <td className="text-center">
                      {d.absentCount ? <span className="font-bold text-red-600">{d.absentCount}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="text-center">
                      {d.excusedCount ? <span className="font-bold text-amber-600">{d.excusedCount}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="text-center">
                      {d.lateCount ? <span className="font-bold text-violet-600">{d.lateCount}</span> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* السلوك */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.evaluation className="h-5 w-5 text-emerald-600" />
          السلوك
        </h2>
        {student.behaviorEntries.length === 0 ? (
          <EmptyState icon="evaluation" title="لا ملاحظات سلوكية منشورة" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {student.behaviorEntries.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="text-xs text-slate-400">
                  {b.date.toLocaleDateString("ar")}
                  {b.lessonSession && ` — ${b.lessonSession.subject.name}`}
                  {b.period ? ` ح${b.period}` : ""}
                </span>
                {b.category && (
                  <Badge tone={BEHAVIOR_TONE[b.category] ?? "slate"}>
                    {BEHAVIOR_AR[b.category as keyof typeof BEHAVIOR_AR]}
                  </Badge>
                )}
                {b.text && <span className="flex-1 text-slate-600">{b.text}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* الدرجات */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.grades className="h-5 w-5 text-accent-600" />
          الدرجات
        </h2>
        {student.grades.length === 0 ? (
          <EmptyState icon="grades" title="لا درجات مسجلة بعد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">التاريخ</th>
                  <th className="text-start font-semibold">المادة</th>
                  <th className="text-start font-semibold">التقييم</th>
                  <th className="text-center font-semibold">الدرجة</th>
                </tr>
              </thead>
              <tbody>
                {student.grades.map((g) => (
                  <tr key={g.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 text-slate-500">
                      {g.assessment.date.toLocaleDateString("ar")}
                    </td>
                    <td className="font-medium text-slate-700">{g.assessment.subject.name}</td>
                    <td className="text-slate-600">
                      {g.assessment.title}
                      <span className="mr-1 text-xs text-slate-400">
                        ({KIND_AR[g.assessment.kind] ?? g.assessment.kind})
                      </span>
                    </td>
                    <td className="text-center">
                      {g.score != null ? (
                        <span className="font-bold text-slate-800">
                          {g.score}
                          <span className="text-xs font-normal text-slate-400">/{g.assessment.maxScore}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* التقييمات الدورية */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.reports className="h-5 w-5 text-violet-600" />
          التقييمات الدورية
        </h2>
        {evalsBySubject.size === 0 && statsBySubject.size === 0 ? (
          <EmptyState icon="reports" title="لا تقييمات مسجلة بعد" />
        ) : (
          <div className="space-y-4">
            {[...new Set([...evalsBySubject.keys(), ...statsBySubject.keys()])].map((subject) => {
              const stats = statsBySubject.get(subject);
              const rows = evalsBySubject.get(subject) ?? [];
              return (
                <div key={subject}>
                  <h3 className="mb-1.5 text-sm font-bold text-slate-600">{subject}</h3>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {stats && (
                      <>
                        <li className="flex items-center justify-between rounded-lg bg-brand-50/60 px-3 py-2 text-sm ring-1 ring-brand-100">
                          <span className="text-slate-600">الدرجة الأكاديمية</span>
                          <Badge tone="brand">{stats.pct}%</Badge>
                        </li>
                        <li className="flex items-center justify-between rounded-lg bg-brand-50/60 px-3 py-2 text-sm ring-1 ring-brand-100">
                          <span className="text-slate-600">التقدير</span>
                          <Badge tone={LETTER_TONE[stats.letter] ?? "slate"}>{stats.letter}</Badge>
                        </li>
                      </>
                    )}
                    {rows.map((r) => (
                      <li
                        key={r.category}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-600">
                          {r.category}
                          {r.weekStart && (
                            <span className="mr-1 text-[10px] text-slate-400">
                              (أسبوع {r.weekStart.toLocaleDateString("ar", { day: "numeric", month: "short" })})
                            </span>
                          )}
                        </span>
                        <Badge tone="slate">{r.value}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* الملاحظات */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.behavior className="h-5 w-5 text-slate-500" />
          ملاحظات المدرسة
        </h2>
        {student.notes.length === 0 ? (
          <EmptyState icon="behavior" title="لا ملاحظات منشورة" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {student.notes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="text-xs text-slate-400">{n.date.toLocaleDateString("ar")}</span>
                <Badge tone={NOTE_TONE[n.category] ?? "slate"}>
                  {NOTE_CAT_AR[n.category] ?? n.category}
                </Badge>
                <span className="flex-1 text-slate-600">{n.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* تفاصيل الحصص */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.schedule className="h-5 w-5 text-accent-600" />
          تفاصيل الحصص الأخيرة
        </h2>
        {student.attendanceEntries.length === 0 ? (
          <EmptyState icon="schedule" title="لا سجلات بعد" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {student.attendanceEntries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-slate-600">
                  {e.lessonSession.date.toLocaleDateString("ar")} — الحصة{" "}
                  {e.lessonSession.period}
                  <span className="font-medium text-slate-800"> ({e.lessonSession.subject.name})</span>
                </span>
                <Badge tone={ENTRY_TONE[e.status] ?? "emerald"}>
                  {LESSON_STATUS_AR[e.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

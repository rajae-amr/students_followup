import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import type { StudentReportContent } from "@app/core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { PrintTrigger } from "./print-trigger";

const KIND_AR: Record<string, string> = {
  quiz: "اختبار قصير",
  homework: "واجب",
  exam: "اختبار",
  participation: "مشاركة",
};
const LETTER_TONE: Record<string, "emerald" | "brand" | "amber" | "red"> = {
  A: "emerald", B: "brand", C: "amber", D: "amber", F: "red",
};

/** عرض تقرير مدرسي مُرسل لولي الأمر — يقرأ اللقطة الثابتة ويوثّق القراءة */
export default async function GuardianReportView({
  params,
}: {
  params: Promise<{ id: string; snapshotId: string }>;
}) {
  const actor = await requireRole("guardian");
  const { id, snapshotId } = await params;

  // نفس حارس ملف الطالب: ربط موثق فقط — لا IDOR
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
  if (!link?.verified || link.canViewReports === false) notFound();

  const snap = await prisma.reportSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snap || snap.studentId !== id || snap.status !== "sent") notFound();

  // توثيق القراءة — مرة واحدة لكل ولي لكل لقطة
  const already = await prisma.reportViewEvent.findFirst({
    where: { reportSnapshotId: snap.id, viewerUserId: actor.userId },
    select: { id: true },
  });
  if (!already) {
    await prisma.reportViewEvent.create({
      data: {
        reportSnapshotId: snap.id,
        studentId: id,
        viewerUserId: actor.userId,
      },
    });
  }

  const r = snap.contentJson as unknown as StudentReportContent;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/parent/student/${id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <Icon.arrowBack className="h-4 w-4" />
        {r.student.name}
      </Link>

      <div className="print-area">
        <Card className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                تقرير {r.student.name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {r.student.className ?? ""} — الفترة{" "}
                <span dir="ltr">{r.range.start} ← {r.range.end}</span>
              </p>
            </div>
            <Badge tone="emerald">
              <Icon.check className="h-3.5 w-3.5" />
              تقرير معتمد
            </Badge>
          </div>
        </Card>

        {/* الحضور */}
        <Card className="mb-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.attendance className="h-5 w-5 text-brand-600" />
            الحضور — {r.attendance.daysRecorded} يوماً مرصوداً
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">حضور: {r.attendance.present}</span>
            <span className="rounded-lg bg-red-50 px-3 py-1.5 font-medium text-red-700">غياب: {r.attendance.absent}</span>
            <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-amber-700">استئذان: {r.attendance.excused}</span>
            <span className="rounded-lg bg-violet-50 px-3 py-1.5 font-medium text-violet-700">تأخير: {r.attendance.late}</span>
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-600">غياب جزئي: {r.attendance.partial}</span>
          </div>
          {r.attendance.lessonEntries.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
              {r.attendance.lessonEntries.map((e, i) => (
                <li key={i} className="text-xs text-slate-600">
                  {e.date} — حصة {e.period} ({e.subject}): {e.statusAr}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* الدرجات */}
        {r.grades.length > 0 && (
          <Card className="mb-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon.grades className="h-5 w-5 text-accent-600" />
              الدرجات
            </h2>
            <div className="space-y-3">
              {r.grades.map((g) => (
                <div key={g.subject + g.teacher}>
                  <p className="text-sm font-bold text-slate-700">
                    {g.subject} <span className="text-xs font-normal text-slate-400">— {g.teacher}</span>
                  </p>
                  <ul className="mt-1 text-sm text-slate-600">
                    {g.assessments.map((a, i) => (
                      <li key={i} className="flex justify-between border-b border-slate-50 py-1.5 last:border-0">
                        <span>
                          {a.title}
                          <span className="mr-1 text-xs text-slate-400">({KIND_AR[a.kind] ?? a.kind} — {a.date})</span>
                        </span>
                        <b>{a.score ?? "—"}<span className="text-xs font-normal text-slate-400">/{a.max}</span></b>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* التقييمات */}
        {r.evaluations.length > 0 && (
          <Card className="mb-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon.evaluation className="h-5 w-5 text-violet-600" />
              التقييمات الأسبوعية
            </h2>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {r.evaluations.map((e, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-600">
                    {e.category}
                    <span className="mr-1 text-xs text-slate-400">({e.subject})</span>
                  </span>
                  <Badge tone={LETTER_TONE[e.value] ?? "slate"}>{e.value}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* السلوك */}
        {r.behavior.length > 0 && (
          <Card className="mb-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon.behavior className="h-5 w-5 text-emerald-600" />
              السلوك والملاحظات
            </h2>
            <ul className="divide-y divide-slate-100">
              {r.behavior.map((b, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="text-xs text-slate-400">{b.date} — {b.teacher}</span>
                  {b.category && <Badge tone="brand">{b.category}</Badge>}
                  {b.text && <span className="text-slate-600">{b.text}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="print:hidden mt-4 text-center">
        <PrintTrigger />
      </div>
    </div>
  );
}

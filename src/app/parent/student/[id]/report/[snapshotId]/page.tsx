import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import type { StudentReportContent } from "@app/core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { ReportBody } from "@/components/report-body";
import { PrintTrigger } from "@/components/print-trigger";

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

        <ReportBody r={r} />
      </div>

      <div className="print:hidden mt-4 text-center">
        <PrintTrigger />
      </div>
    </div>
  );
}

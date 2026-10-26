import Link from "next/link";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { ReportGenerator } from "./report-generator";
import { BulkGenerate } from "./bulk-generate";
import { ReportTabs } from "./report-tabs";
import { runWeeklyDigest } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

const OUT_STATUS: Record<string, { label: string; tone: "slate" | "amber" | "emerald" | "red" }> = {
  pending: { label: "معلق", tone: "amber" },
  processing: { label: "قيد الإرسال", tone: "amber" },
  done: { label: "تم", tone: "emerald" },
  failed: { label: "فشل", tone: "red" },
  cancelled: { label: "ملغى", tone: "slate" },
};

/** مركز توليد التقارير — فردي وجماعي والتلخيص الأسبوعي المجدول */
export default async function ReportsAdmin() {
  await requirePerm("reports");

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });

  const [students, classes, gradeLevels, terms, lastDigest, pendingCount, failedCount] = await Promise.all([
    prisma.student.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
    prisma.classGroup.findMany({
      where: { isActive: true, academicYearId: year?.id },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
    prisma.gradeLevel.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    year
      ? prisma.term.findMany({
          where: { academicYearId: year.id },
          orderBy: { startDate: "asc" },
          select: { id: true, name: true },
        })
      : [],
    prisma.outboxEvent.findFirst({
      where: { type: "weekly_digest" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true },
    }),
    prisma.outboxEvent.count({ where: { status: { in: ["pending", "processing"] } } }),
    prisma.outboxEvent.count({ where: { status: "failed" } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="التقارير المدرسية" subtitle="توليد تقارير الطلاب وإرسالها لأولياء الأمور" />
      <ReportTabs />

      {/* مؤشرات الطابور — رابط سريع للسجل */}
      {(pendingCount > 0 || failedCount > 0) && (
        <Link href="/admin/reports/outbox" className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200 transition hover:ring-brand-300">
          <Icon.bell className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500">الطابور الآن:</span>
          {pendingCount > 0 && <Badge tone="amber">{pendingCount} قيد الإرسال</Badge>}
          {failedCount > 0 && <Badge tone="red">{failedCount} فشل</Badge>}
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.reports className="h-5 w-5 text-brand-600" />
            توليد تقرير طالب
          </h2>
          <ReportGenerator students={students.map((s) => ({ id: s.id, name: s.fullName }))} />
        </Card>

        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-800">
            <Icon.bell className="h-5 w-5 text-accent-600" />
            التلخيص الأسبوعي
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            يولّد تقريراً معتمداً لكل طالب ويرسل رسالة واحدة موحدة لكل ولي أمر تشمل جميع أبنائه.
            يتخطى بأمان إن لم يُهيأ التقويم، ويعمل آلياً كل جمعة.
          </p>
          {lastDigest && (
            <p className="mb-3 flex items-center gap-2 text-xs text-slate-500">
              آخر تشغيل: {lastDigest.createdAt.toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" })}
              <Badge tone={OUT_STATUS[lastDigest.status]?.tone ?? "slate"}>
                {OUT_STATUS[lastDigest.status]?.label ?? lastDigest.status}
              </Badge>
            </p>
          )}
          <FormWithResult action={runWeeklyDigest} submitLabel="تشغيل الآن">
            <span />
          </FormWithResult>
        </Card>
      </div>

      {/* التوليد الجماعي */}
      <Card className="mt-4">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-800">
          <Icon.reports className="h-5 w-5 text-violet-600" />
          توليد جماعي
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          لقطات معتمدة دفعة واحدة — لصف أو مستوى أو المدرسة كلها، لمدى محدد أو فصل دراسي كامل.
          التقارير الموجودة لنفس المدى تُعاد استخدامها دون ازدواج.
        </p>
        <BulkGenerate
          classes={classes.map((c) => ({ id: c.id, name: c.displayName }))}
          grades={gradeLevels}
          terms={terms}
        />
      </Card>
    </div>
  );
}

export const metadata = { title: "التقارير" };

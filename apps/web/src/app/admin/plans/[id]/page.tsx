import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { schoolWeekDays } from "@app/core";
import type { PublishedPlanSubject } from "@app/core";
import { PlanDocument } from "@/components/plan-document";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function PlanPublicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;

  const [pub, weekDays, settings] = await Promise.all([
    prisma.classWeeklyPlanPublication.findUnique({
      where: { id },
      include: { class: { select: { displayName: true, name: true } } },
    }),
    schoolWeekDays(),
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
  ]);
  if (!pub) notFound();

  const subjects = pub.contentJson as unknown as PublishedPlanSubject[];
  const fmt = (d: Date) => d.toLocaleDateString("ar", { day: "numeric", month: "long" });
  const end = new Date(pub.weekStart);
  end.setUTCDate(end.getUTCDate() + 6);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`لقطة الخطة — ${pub.class.displayName ?? pub.class.name}`}
        subtitle={`نُشرت ${pub.publishedAt.toLocaleString("ar")}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a
          href={`/api/plans/${pub.id}/pdf`}
          target="_blank"
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700"
        >
          ⬇ تنزيل PDF
        </a>
        <PrintButton />
        <Link
          href={`/admin/plans?class=${pub.classId}`}
          className="text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          → العودة للوحة
        </Link>
      </div>

      <Card className="print:border-none print:p-0">
        <PlanDocument
          schoolName={settings?.schoolName ?? "المدرسة"}
          className={pub.class.displayName ?? pub.class.name}
          weekRange={`${fmt(pub.weekStart)} – ${fmt(end)}`}
          weekDays={weekDays}
          subjects={subjects}
        />
      </Card>
    </div>
  );
}

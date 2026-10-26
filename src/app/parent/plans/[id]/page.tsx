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

export default async function ParentPlanViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole("guardian");
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

  // الولي يرى خطط صفوف أبنائه فقط
  const profile = await prisma.guardianProfile.findUnique({ where: { userId: actor.userId } });
  const allowed = profile
    ? await prisma.guardianStudent.findFirst({
        where: {
          guardianId: profile.id,
          verified: true,
          student: { enrollments: { some: { classId: pub.classId } } },
        },
      })
    : null;
  if (!allowed) notFound();

  const fmt = (d: Date) => d.toLocaleDateString("ar", { day: "numeric", month: "long", timeZone: "UTC" });
  const end = new Date(pub.weekStart);
  end.setUTCDate(end.getUTCDate() + 6);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`الخطة الأسبوعية — ${pub.class.displayName ?? pub.class.name}`}
        subtitle={`أسبوع ${fmt(pub.weekStart)} – ${fmt(end)}`}
        crumbs={[
          { label: "الخطط الأسبوعية", href: "/parent/plans" },
          { label: pub.class.displayName ?? pub.class.name },
        ]}
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
        <Link href="/parent/plans" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          → كل الخطط
        </Link>
      </div>

      <Card>
        <PlanDocument
          schoolName={settings?.schoolName ?? "المدرسة"}
          className={pub.class.displayName ?? pub.class.name}
          weekRange={`${fmt(pub.weekStart)} – ${fmt(end)}`}
          weekDays={weekDays}
          subjects={pub.contentJson as unknown as PublishedPlanSubject[]}
        />
      </Card>
    </div>
  );
}

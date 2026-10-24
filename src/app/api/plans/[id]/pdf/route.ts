import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getActor } from "@/server/session";
import { schoolWeekDays } from "@app/core";
import type { PublishedPlanSubject } from "@app/core";
import { renderPlanPdf } from "@/lib/planPdf";

export const runtime = "nodejs";

function fmt(d: Date) {
  return d.toLocaleDateString("ar", { day: "numeric", month: "long", timeZone: "UTC" });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return new NextResponse("غير مصرّح", { status: 401 });
  const { id } = await params;

  const pub = await prisma.classWeeklyPlanPublication.findUnique({
    where: { id },
    include: {
      class: { select: { displayName: true, name: true, academicYear: { select: { name: true } } } },
    },
  });
  if (!pub) return new NextResponse("غير موجود", { status: 404 });

  // الصلاحية: إدارة/معلم، أو ولي أمر لطالب مقيّد بالصف
  if (actor.role === "guardian") {
    const profile = await prisma.guardianProfile.findUnique({ where: { userId: actor.userId } });
    const ok = profile
      ? await prisma.guardianStudent.findFirst({
          where: {
            guardianId: profile.id,
            student: { enrollments: { some: { classId: pub.classId } } },
          },
        })
      : null;
    if (!ok) return new NextResponse("غير مصرّح", { status: 403 });
  } else if (actor.role !== "admin" && actor.role !== "teacher") {
    return new NextResponse("غير مصرّح", { status: 403 });
  }

  const [settings, weekDays] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    schoolWeekDays(),
  ]);
  const end = new Date(pub.weekStart);
  end.setUTCDate(end.getUTCDate() + 6);

  const pdf = await renderPlanPdf({
    schoolName: settings?.schoolName ?? "المدرسة",
    className: pub.class.displayName ?? pub.class.name,
    schoolYear: pub.class.academicYear?.name,
    weekRange: `${fmt(pub.weekStart)} – ${fmt(end)}`,
    weekDays,
    subjects: pub.contentJson as unknown as PublishedPlanSubject[],
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="weekly-plan-${pub.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

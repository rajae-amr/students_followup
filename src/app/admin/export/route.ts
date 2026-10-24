import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@app/auth";
import { prisma } from "@app/db";
import { buildWeeklyRegister, parsePerms } from "@app/core";

export const runtime = "nodejs";

/** GET /admin/export?class=<classId|all>&week=<YYYY-MM-DD> — كشف حضور أسبوعي Excel (إدارة فقط). */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = session?.user?.role as string | undefined;
  let allowed = role === "admin";
  if (session && role === "staff") {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { permissions: true },
    });
    allowed = parsePerms(u?.permissions).includes("export");
  }
  if (!allowed)
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });

  const url = new URL(req.url);
  const classParam = url.searchParams.get("class");
  const weekParam = url.searchParams.get("week");

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const settings = await prisma.schoolSettings.findFirst();
  if (!year) return NextResponse.json({ error: "لا يوجد عام دراسي" }, { status: 400 });

  const weekStart = startOfWeek(weekParam ? new Date(`${weekParam}T00:00:00.000Z`) : new Date());

  const buf = await buildWeeklyRegister({
    weekStart,
    classId: classParam && classParam !== "all" ? classParam : undefined,
    academicYearId: year.id,
    schoolName: settings?.schoolName ?? "المدرسة",
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-${weekParam ?? weekStart.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

/** اثنين الأسبوع المحتوي للتاريخ (أيام الدوام إثنين–جمعة). */
function startOfWeek(d: Date) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@app/auth";
import { prisma } from "@app/db";
import { buildStudentsTemplate, parsePerms } from "@app/core";

export const runtime = "nodejs";

/** GET /admin/students/import/template — قالب Excel لاستيراد الطلاب (شعبه بقائمة منسدلة) */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = session?.user?.role as string | undefined;
  let allowed = role === "admin";
  if (session && role === "staff") {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { permissions: true },
    });
    allowed = parsePerms(u?.permissions).includes("students");
  }
  if (!allowed) return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });

  const [settings, year] = await Promise.all([
    prisma.schoolSettings.findFirst(),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
  ]);
  if (!year) return NextResponse.json({ error: "لا يوجد عام دراسي" }, { status: 400 });

  const classes = await prisma.classGroup.findMany({
    where: { academicYearId: year.id, isActive: true },
    orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
    select: { displayName: true, name: true },
  });

  const buf = await buildStudentsTemplate({
    schoolName: settings?.schoolName ?? "المدرسة",
    classes: classes.map((c) => c.displayName || c.name),
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="students-template.xlsx"; filename*=UTF-8''%D9%82%D8%A7%D9%84%D8%A8-%D8%A7%D8%B3%D8%AA%D9%8A%D8%B1%D8%A7%D8%AF-%D8%A7%D9%84%D8%B7%D9%84%D8%A7%D8%A8.xlsx`,
    },
  });
}

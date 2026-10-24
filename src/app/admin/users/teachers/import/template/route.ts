import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@app/auth";
import { prisma } from "@app/db";
import { buildTeachersTemplate } from "@app/core";

export const runtime = "nodejs";

/** GET /admin/users/teachers/import/template — قالب Excel لاستيراد المعلمين (مواده بقائمة منسدلة) */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });

  const [settings, subjects] = await Promise.all([
    prisma.schoolSettings.findFirst(),
    prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  const buf = await buildTeachersTemplate({
    schoolName: settings?.schoolName ?? "المدرسة",
    subjects: subjects.map((s) => s.name),
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="teachers-template.xlsx"; filename*=UTF-8''%D9%82%D8%A7%D9%84%D8%A8-%D8%A7%D8%B3%D8%AA%D9%8A%D8%B1%D8%A7%D8%AF-%D8%A7%D9%84%D9%85%D8%B9%D9%84%D9%85%D9%8A%D9%86.xlsx`,
    },
  });
}

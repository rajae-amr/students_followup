import { NextResponse } from "next/server";
import { getActor, getStaffPerms } from "@/server/session";
import { prisma } from "@app/db";
import { ADMIN_LINKS, TEACHER_LINKS, GUARDIAN_LINKS } from "@/components/nav-links";

type Item = { href: string; title: string; sub?: string };
type Group = { label: string; items: Item[] };

/** بحث موحّد يعيد مجموعات حسب دور المستخدم وصلاحياته */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ groups: [] }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ groups: [] });

  const groups: Group[] = [];
  const contains = q;
  const ci = { contains, mode: "insensitive" as const };

  if (actor.role === "admin" || actor.role === "staff") {
    const perms = actor.role === "admin" ? null : await getStaffPerms(actor.userId);
    const [students, classes, teachers] = await Promise.all([
      prisma.student.findMany({
        where: { fullName: ci, isActive: true },
        take: 6,
        orderBy: { fullName: "asc" },
        include: { enrollments: { take: 1, include: { class: { select: { id: true, displayName: true, name: true } } } } },
      }),
      prisma.classGroup.findMany({
        where: { OR: [{ name: ci }, { displayName: ci }], isActive: true },
        take: 4,
        include: { _count: { select: { students: true } } },
      }),
      prisma.user.findMany({
        where: { role: "teacher", name: ci, isActive: true },
        take: 4,
        select: { id: true, name: true, username: true },
      }),
    ]);

    if (students.length)
      groups.push({
        label: "الطلاب",
        items: students.map((s) => {
          const cls = s.enrollments[0]?.class;
          return {
            title: s.fullName,
            sub: cls ? (cls.displayName ?? cls.name) : "بدون قيد",
            href: cls ? `/admin/students/${cls.id}/${s.id}` : `/admin/students/all`,
          };
        }),
      });
    if (classes.length)
      groups.push({
        label: "الصفوف",
        items: classes.map((c) => ({
          title: c.displayName ?? c.name,
          sub: `${c._count.students} طالب · ${c.name}`,
          href: `/admin/students/${c.id}`,
        })),
      });
    if (teachers.length)
      groups.push({
        label: "المعلمون",
        items: teachers.map((t) => ({
          title: t.name,
          sub: t.username ?? undefined,
          href: `/admin/users/teachers/${t.id}`,
        })),
      });

    const pages = ADMIN_LINKS.filter(
      (l) => l.label.includes(q) && (!l.perm || actor.role === "admin" || perms?.includes(l.perm as never)),
    );
    if (pages.length)
      groups.push({ label: "الصفحات", items: pages.map((l) => ({ title: l.label, href: l.href })) });
  } else if (actor.role === "teacher") {
    const assigns = await prisma.teachingAssignment.findMany({
      where: {
        teacherId: actor.userId,
        isActive: true,
        class: { OR: [{ name: ci }, { displayName: ci }], isActive: true },
        academicYear: { isCurrent: true },
      },
      take: 4,
      include: { class: { select: { id: true, displayName: true, name: true } }, subject: { select: { name: true } } },
      distinct: ["classId"],
    });
    if (assigns.length)
      groups.push({
        label: "صفوفي",
        items: assigns.map((a) => ({
          title: a.class.displayName ?? a.class.name,
          sub: a.subject.name,
          href: "/teacher/grades",
        })),
      });
    const pages = TEACHER_LINKS.filter((l) => l.label.includes(q));
    if (pages.length)
      groups.push({ label: "الصفحات", items: pages.map((l) => ({ title: l.label, href: l.href })) });
  } else {
    const profile = await prisma.guardianProfile.findUnique({ where: { userId: actor.userId } });
    const children = profile
      ? await prisma.guardianStudent.findMany({
          where: { guardianId: profile.id, verified: true, student: { fullName: ci, isActive: true } },
          take: 5,
          include: { student: { select: { id: true, fullName: true } } },
        })
      : [];
    if (children.length)
      groups.push({
        label: "أبنائي",
        items: children.map((c) => ({ title: c.student.fullName, href: `/parent/student/${c.student.id}` })),
      });
    const pages = GUARDIAN_LINKS.filter((l) => l.label.includes(q));
    if (pages.length)
      groups.push({ label: "الصفحات", items: pages.map((l) => ({ title: l.label, href: l.href })) });
  }

  return NextResponse.json({ groups });
}

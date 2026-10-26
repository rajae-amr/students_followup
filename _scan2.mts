import { prisma } from "./packages/db/src/index";
const y = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
const inactive = await prisma.classGroup.findMany({
  where: { academicYearId: y.id, isActive: false },
  select: { id: true, name: true, displayName: true,
    _count: { select: { students: true, timetableSlots: true, lessonSessions: true, assessments: true, assignments: true } } },
});
console.log("INACTIVE:", inactive.length ? "" : "none");
for (const c of inactive) console.log(`${c.name} | disp=${c.displayName} | stu=${c._count.students} slots=${c._count.timetableSlots} sess=${c._count.lessonSessions} assm=${c._count.assessments} asgn=${c._count.assignments}`);
// كل السنوات للتأكد من وجود G10-GEN-1L تاريخياً
const all = await prisma.classGroup.findMany({ where: { name: { in: ["G10-GEN-1L","G10-GEN-3L","G10-GEN-4L","G11-GEN-2L"] } }, select: { name: true, academicYearId: true, isActive: true } });
console.log("CODE OWNERS (any year):", JSON.stringify(all));
process.exit(0);

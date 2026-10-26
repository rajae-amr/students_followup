import { prisma } from "./packages/db/src/index";
const y = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
const classes = await prisma.classGroup.findMany({
  where: { academicYearId: y.id },
  orderBy: [{ name: "asc" }],
  select: {
    id: true, name: true, displayName: true, isActive: true, gradeId: true,
    _count: { select: { students: true, timetableSlots: true, lessonSessions: true, assessments: true, assignments: true, weeklyPlans: true, planPublications: true } },
  },
});
for (const c of classes) {
  const r = c._count;
  console.log(`${c.isActive ? "ON " : "off"} | ${c.name.padEnd(28)} | disp=${(c.displayName ?? "-").padEnd(26)} | grd=${c.gradeId ? "Y" : "-"} | stu=${r.students} slots=${r.timetableSlots} sess=${r.lessonSessions} assm=${r.assessments} asgn=${r.assignments} wk=${r.weeklyPlans} pub=${r.planPublications}`);
}
process.exit(0);

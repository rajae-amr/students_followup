import { prisma } from "@app/db";

for (const cid of ["cmvh3e9es0002un4grpcot2jy", "cmvh3rek0001iun08hbprc9di"]) {
  const enr = await prisma.enrollment.findMany({
    where: { classId: cid },
    include: { student: { select: { fullName: true, isActive: true, createdAt: true } } },
  });
  console.log(`\n=== ${cid} (${enr.length}) ===`);
  for (const e of enr) console.log(` ${e.student.isActive ? "✓" : "✗"} ${e.student.fullName} — ${e.student.createdAt.toISOString().slice(0, 10)}`);
}
await prisma.$disconnect();

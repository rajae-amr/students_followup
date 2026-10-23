/**
 * اختبار نهاية-لنهاية لإشعار الخطة الأسبوعية:
 * ينشئ ولي أمر تجريبياً مرتبطاً بمحادثة معيّنة + خطة مسلّمة،
 * ثم يستدعي publishClassPlan وdrainOutbox الحقيقيين.
 * التشغيل: npx tsx scripts/test-plan-send.tsx
 */
import fs from "node:fs";
import path from "node:path";

const env = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+?)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && m[1]) process.env[m[1]] = m[2];
}

const { prisma } = await import("@app/db");
const { publishClassPlan, weekStartOf } = await import("@app/core");
const { drainOutbox } = await import("../src/lib/jobs/drain");

const CHAT_ID = "5813379883"; // محادثة الاختبار

// 1) ولي أمر تجريبي مرتبط بالمحادثة + طالب في الصف
const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
const cls = await prisma.classGroup.findFirst({
  where: { academicYearId: year?.id, isActive: true },
});
const student = await prisma.student.findFirst({
  where: { isActive: true, enrollments: { some: { classId: cls!.id } } },
});
if (!cls || !student || !year) throw new Error("لا صف/طالب/عام في القاعدة");

// telegramChatId فريد — نبني ملف ولي أمر على demo_teacher المالك للمحادثة
const gUser = await prisma.user.findFirst({ where: { telegramChatId: CHAT_ID } });
if (!gUser) throw new Error(`لا مستخدم بالمحادثة ${CHAT_ID}`);
let profile = await prisma.guardianProfile.findUnique({ where: { userId: gUser.id } });
if (!profile) profile = await prisma.guardianProfile.create({ data: { userId: gUser.id } });
await prisma.guardianStudent.upsert({
  where: { guardianId_studentId: { guardianId: profile.id, studentId: student.id } },
  create: { guardianId: profile.id, studentId: student.id, verified: true },
  update: { verified: true },
});
console.log("guardian:", gUser.id, "→ student:", student.fullName);

// 2) خطة مسلّمة لأول إسناد في الصف
const asg = await prisma.teachingAssignment.findFirst({
  where: { classId: cls.id, academicYearId: year.id, isActive: true },
});
if (!asg) throw new Error("لا إسناد للصف");
const weekStart = weekStartOf(new Date());
const plan = await prisma.weeklyPlan.upsert({
  where: {
    teacherId_classId_subjectId_weekStart: {
      teacherId: asg.teacherId, classId: cls.id, subjectId: asg.subjectId, weekStart,
    },
  },
  create: {
    teacherId: asg.teacherId, classId: cls.id, subjectId: asg.subjectId,
    weekStart, status: "submitted", submittedAt: new Date(),
    entries: {
      create: [
        { weekday: 0, lessonTitle: "الجمع والطرح", textbook: "ص 10-12", tests: "—" },
        { weekday: 1, lessonTitle: "الضرب", textbook: "ص 13-15", platforms: "تمرين 2", tests: "اختبار قصير" },
        { weekday: 2, lessonTitle: "القسمة", textbook: "ص 16-18", notes: "واجب منزلي" },
      ],
    },
  },
  update: { status: "submitted", submittedAt: new Date() },
});
console.log("plan:", plan.id, "submitted for", cls.displayName, "week", weekStart.toISOString().slice(0, 10));

// 3) نشر + تصفية الطابور — المسار الحقيقي
const admin = await prisma.user.findFirst({ where: { username: "admin" } });
const res = await publishClassPlan(
  { userId: admin!.id, role: "admin", isActive: true },
  { classId: cls.id, weekStart },
);
console.log("published:", JSON.stringify(res));

const done = await drainOutbox(10);
console.log("drained:", done);
await prisma.$disconnect();

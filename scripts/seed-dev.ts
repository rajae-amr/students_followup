/**
 * بيانات تطوير اصطناعية — أسماء وهمية 100%، لبيئة التطوير فقط.
 *
 * الاستخدام (بعد migrate):
 *   npx tsx scripts/seed-dev.ts
 *
 * ينشئ: معلم تجريبي (demo_teacher / demo1234)، صفاً، 20 طالباً وهمياً،
 * مادة، إسناداً، وجدول حصص لأيام الأسبوع الدراسية.
 * لا يُشغَّل أبداً على قاعدة إنتاج أو بيانات حقيقية.
 */

import { auth } from "@app/auth";
import { prisma } from "@app/db";

const FAKE_NAMES = [
  "طالب تجريبي 01", "طالب تجريبي 02", "طالب تجريبي 03", "طالب تجريبي 04",
  "طالب تجريبي 05", "طالب تجريبي 06", "طالب تجريبي 07", "طالب تجريبي 08",
  "طالب تجريبي 09", "طالب تجريبي 10", "طالب تجريبي 11", "طالب تجريبي 12",
  "طالب تجريبي 13", "طالب تجريبي 14", "طالب تجريبي 15", "طالب تجريبي 16",
  "طالب تجريبي 17", "طالب تجريبي 18", "طالب تجريبي 19", "طالب تجريبي 20",
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ممنوع التشغيل في الإنتاج");
    process.exit(1);
  }

  const year = await prisma.academicYear.upsert({
    where: { name: "2026/2027" },
    create: {
      name: "2026/2027",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2027-06-30"),
      isCurrent: true,
    },
    update: { isCurrent: true },
  });

  const cls = await prisma.classGroup.upsert({
    where: { academicYearId_name: { academicYearId: year.id, name: "DEV-CLASS-1" } },
    create: {
      name: "DEV-CLASS-1",
      displayName: "صف تجريبي - شعبة 1",
      academicYearId: year.id,
    },
    update: {},
  });

  const subject = await prisma.subject.upsert({
    where: { name: "رياضيات تجريبية" },
    create: { name: "رياضيات تجريبية" },
    update: {},
  });

  let teacher = await prisma.user.findUnique({ where: { username: "demo_teacher" } });
  if (!teacher) {
    const res = await auth.api.signUpEmail({
      body: {
        email: "demo_teacher@internal.school",
        password: "demo1234",
        name: "معلم تجريبي",
        username: "demo_teacher",
      },
    });
    const userId = (res as { user?: { id: string } }).user?.id;
    if (!userId) throw new Error("فشل إنشاء المعلم");
    teacher = await prisma.user.update({
      where: { id: userId },
      data: { role: "teacher" },
    });
    await prisma.teacherProfile.create({ data: { userId } });
  }
  console.log("معلم: demo_teacher / demo1234");

  for (const name of FAKE_NAMES) {
    const student =
      (await prisma.student.findFirst({ where: { fullName: name } })) ??
      (await prisma.student.create({ data: { fullName: name } }));
    await prisma.enrollment.upsert({
      where: { id: `${student.id}:${cls.id}` },
      create: {
        id: `${student.id}:${cls.id}`,
        studentId: student.id,
        classId: cls.id,
        academicYearId: year.id,
      },
      update: {},
    });
  }
  console.log(`${FAKE_NAMES.length} طالباً وهمياً`);

  await prisma.teachingAssignment.upsert({
    where: {
      teacherId_classId_subjectId_academicYearId: {
        teacherId: teacher.id,
        classId: cls.id,
        subjectId: subject.id,
        academicYearId: year.id,
      },
    },
    create: {
      teacherId: teacher.id,
      classId: cls.id,
      subjectId: subject.id,
      academicYearId: year.id,
    },
    update: { isActive: true },
  });

  // حصتان كل يوم دراسي (أحد-خميس)
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  for (const weekday of [0, 1, 2, 3, 4]) {
    for (const period of [1, 3]) {
      await prisma.timetableSlot.create({
        data: {
          teacherId: teacher.id,
          classId: cls.id,
          subjectId: subject.id,
          weekday,
          period,
          effectiveFrom: from,
        },
      });
    }
  }
  console.log("جدول الحصص: حصتان يومياً (أحد-خميس)");
  console.log("تم. سجّل الدخول بـ demo_teacher / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

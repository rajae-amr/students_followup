/**
 * اختبار أداء على نطاق المدرسة المستهدف (~3000 طالب).
 * يزرع 3000 طالباً في 100 صف، يقيس الاستعلامات الحرجة، ثم ينظّف بالكامل.
 * الحدود: كشف حصة < 2ث، كشوفات اليوم < 2ث، قائمة إدارية < 3ث.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const envPath = resolve(__dirname, "../../../db/.env");
if (!process.env.DATABASE_URL && existsSync(envPath)) {
  const m = readFileSync(envPath, "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (m) process.env.DATABASE_URL = m[1]!.trim().replace(/^["']|["']$/g, "");
}
const hasDb = !!process.env.DATABASE_URL;

const { prisma } = hasDb
  ? await import("@app/db")
  : ({ prisma: null } as unknown as Awaited<typeof import("@app/db")>);
const S = await import("../attendance/service");
import type { Actor } from "../permissions";

const run = hasDb ? describe : describe.skip;
const N_STUDENTS = 3000;
const N_CLASSES = 100;

run("الأداء على نطاق 3000 طالب", () => {
  const tag = `PERF-${Date.now()}`;
  const teacher: Actor = { userId: "", role: "teacher", isActive: true };
  const admin: Actor = { userId: "perf-admin", role: "admin", isActive: true };
  let yearId = "", classId = "", slotId = "", sessionId = "";

  const times: Record<string, number> = {};
  const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    const r = await fn();
    times[name] = Math.round(performance.now() - t0);
    return r;
  };

  beforeAll(async () => {
    const year = await prisma!.academicYear.findFirst({ where: { isCurrent: true } });
    yearId = year!.id;
    const u = await prisma!.user.create({
      data: { username: `${tag}-t`, name: "معلم أداء", role: "teacher" },
    });
    teacher.userId = u.id;

    // 100 صف × 30 طالباً = 3000
    const subject = await prisma!.subject.create({ data: { name: `${tag}-subj` } });
    await prisma!.classGroup.createMany({
      data: Array.from({ length: N_CLASSES }, (_, i) => ({
        name: `${tag}-c${i}`, displayName: `صف ${i}`, academicYearId: yearId,
      })),
    });
    const classes = await prisma!.classGroup.findMany({ where: { name: { startsWith: tag } } });
    classId = classes[0]!.id;

    const students = await prisma!.student.createMany({
      data: Array.from({ length: N_STUDENTS }, (_, i) => ({ fullName: `${tag}-طالب ${i}` })),
    });
    void students;
    const stu = await prisma!.student.findMany({
      where: { fullName: { startsWith: tag } }, select: { id: true },
    });
    expect(stu.length).toBe(N_STUDENTS);

    await prisma!.enrollment.createMany({
      data: stu.map((s, i) => ({
        studentId: s.id,
        classId: classes[i % N_CLASSES]!.id,
        academicYearId: yearId,
      })),
    });

    // إسناد + خانة مجدولة للمعلم على الصف الأول فقط
    await prisma!.teachingAssignment.create({
      data: { teacherId: teacher.userId, classId, subjectId: subject.id, academicYearId: yearId },
    });
    const slot = await prisma!.timetableSlot.create({
      data: {
        teacherId: teacher.userId, classId, subjectId: subject.id,
        weekday: new Date().getDay(), period: 1, effectiveFrom: new Date("2020-01-01"),
      },
    });
    slotId = slot.id;
  }, 180_000);

  afterAll(async () => {
    await prisma!.attendanceEntry.deleteMany({ where: { lessonSession: { class: { name: { startsWith: tag } } } } });
    await prisma!.dailySummary.deleteMany({ where: { student: { fullName: { startsWith: tag } } } });
    await prisma!.lessonSession.deleteMany({ where: { class: { name: { startsWith: tag } } } });
    await prisma!.timetableSlot.deleteMany({ where: { class: { name: { startsWith: tag } } } });
    await prisma!.teachingAssignment.deleteMany({ where: { class: { name: { startsWith: tag } } } });
    await prisma!.enrollment.deleteMany({ where: { class: { name: { startsWith: tag } } } });
    await prisma!.student.deleteMany({ where: { fullName: { startsWith: tag } } });
    await prisma!.classGroup.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma!.subject.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma!.user.deleteMany({ where: { username: { startsWith: tag } } });
  }, 120_000);

  it("حصص اليوم للمعلم < 2ث", async () => {
    const lessons = await timed("lessonsForTeacher", () =>
      S.lessonsForTeacher(teacher, new Date()));
    expect(lessons.length).toBe(1);
    expect(times.lessonsForTeacher!).toBeLessThan(2000);
  });

  it("فتح كشف 30 طالباً ورصد الكل < 4ث", async () => {
    const session = await timed("ensureSession", () =>
      S.ensureSession(teacher, slotId, new Date()));
    sessionId = session.id;
    await timed("markAllPresent", () => S.markAllPresent(teacher, sessionId));
    const roster = await timed("sessionRoster", () => S.sessionRoster(teacher, sessionId));
    expect(roster.students.length).toBe(30);
    expect(roster.students.filter((s) => s.status === "present").length).toBe(30);
    expect(times.sessionRoster!).toBeLessThan(2000);
    expect(times.markAllPresent!).toBeLessThan(4000);
  });

  it("استعلامات إدارية على 3000 طالب < 3ث", async () => {
    const students = await timed("adminList", () =>
      prisma!.student.findMany({
        where: { isActive: true },
        include: {
          enrollments: {
            where: { academicYearId: yearId },
            include: { class: { select: { displayName: true } } },
          },
        },
        orderBy: { fullName: "asc" },
      }));
    expect(students.length).toBeGreaterThanOrEqual(N_STUDENTS);
    expect(times.adminList!).toBeLessThan(3000);

    await timed("attendanceBrowse", () =>
      prisma!.attendanceEntry.findMany({
        where: { lessonSession: { date: new Date(new Date().toISOString().slice(0, 10)) } },
        include: { student: { select: { fullName: true } } },
      }));
    expect(times.attendanceBrowse!).toBeLessThan(3000);
  });

  it("طباعة الأزمنة", () => {
    console.log("[perf]", JSON.stringify(times));
  });
});

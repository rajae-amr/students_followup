/**
 * اختبارات تكامل لخدمة الحصص ضد PostgreSQL الحقيقي.
 * تتخطى تلقائياً إن لم تتوفر قاعدة. DATABASE_URL تُقرأ من packages/db/.env
 * — لا سرّ في هذا الملف.
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

const S = await import("./service");
const { ForbiddenError, NotFoundError } = await import("../permissions");
import type { Actor } from "../permissions";

const run = hasDb ? describe : describe.skip;

run("خدمة الحصص — تكامل PostgreSQL", () => {
  const teacherA: Actor = { userId: "", role: "teacher", isActive: true };
  const teacherB: Actor = { userId: "", role: "teacher", isActive: true };
  const guardian: Actor = { userId: "", role: "guardian", isActive: true };
  const tag = `ITEST-${Date.now()}`;
  const DAY = new Date(Date.UTC(2026, 10, 1)); // أحد

  let classId = "", subjectId = "", slotId = "", sessionId = "", yearId = "";
  const studentIds: string[] = [];
  let outsiderId = "";

  beforeAll(async () => {
    const year = await prisma!.academicYear.findFirst({ where: { isCurrent: true } });
    yearId = year!.id;

    const [uA, uB, uG] = await Promise.all([
      prisma!.user.create({ data: { username: `${tag}-a`, name: "معلم أ", role: "teacher" } }),
      prisma!.user.create({ data: { username: `${tag}-b`, name: "معلم ب", role: "teacher" } }),
      prisma!.user.create({ data: { username: `${tag}-g`, name: "ولي", role: "guardian" } }),
    ]);
    teacherA.userId = uA.id; teacherB.userId = uB.id; guardian.userId = uG.id;

    const cls = await prisma!.classGroup.create({
      data: { name: `${tag}-class`, displayName: "صف اختبار", academicYearId: yearId },
    });
    classId = cls.id;
    const subj = await prisma!.subject.create({ data: { name: `${tag}-subj` } });
    subjectId = subj.id;

    for (let i = 1; i <= 3; i++) {
      const st = await prisma!.student.create({ data: { fullName: `${tag}-طالب${i}` } });
      studentIds.push(st.id);
      await prisma!.enrollment.create({
        data: { studentId: st.id, classId, academicYearId: yearId },
      });
    }
    outsiderId = (await prisma!.student.create({ data: { fullName: `${tag}-خارجي` } })).id;

    await prisma!.teachingAssignment.create({
      data: { teacherId: uA.id, classId, subjectId, academicYearId: yearId },
    });
    const slot = await prisma!.timetableSlot.create({
      data: {
        teacherId: uA.id, classId, subjectId,
        weekday: 0, period: 7, effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
      },
    });
    slotId = slot.id;
  });

  afterAll(async () => {
    if (!classId) return;
    await prisma!.attendanceEntry.deleteMany({ where: { lessonSession: { classId } } });
    await prisma!.lessonSession.deleteMany({ where: { classId } });
    await prisma!.dailySummary.deleteMany({ where: { studentId: { in: [...studentIds, outsiderId] } } });
    await prisma!.auditEvent.deleteMany({ where: { actorId: { in: [teacherA.userId, teacherB.userId] } } });
    await prisma!.timetableSlot.deleteMany({ where: { classId } });
    await prisma!.teachingAssignment.deleteMany({ where: { classId } });
    await prisma!.enrollment.deleteMany({ where: { classId } });
    await prisma!.student.deleteMany({ where: { id: { in: [...studentIds, outsiderId] } } });
    await prisma!.classGroup.delete({ where: { id: classId } });
    await prisma!.subject.delete({ where: { id: subjectId } });
    await prisma!.user.deleteMany({
      where: { id: { in: [teacherA.userId, teacherB.userId, guardian.userId] } },
    });
  });

  it("المعلم المسند يفتح جلسة لحصته", async () => {
    const s = await S.ensureSession(teacherA, slotId, DAY);
    sessionId = s.id;
    expect(s.status).toBe("draft");
    expect(s.teacherId).toBe(teacherA.userId);
  });

  it("معلم آخر لا يفتح جلسة لحصة غير مسندة إليه", async () => {
    await expect(S.ensureSession(teacherB, slotId, DAY)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("معلم آخر لا يسجل حضوراً في حصة غير مسندة إليه", async () => {
    await expect(
      S.recordAttendance(teacherB, { sessionId, studentId: studentIds[0]!, status: "absent" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ولي أمر لا يطّلع على كشف الحصة", async () => {
    await expect(S.sessionRoster(guardian, sessionId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("طالب خارج كشف الصف يُرفض", async () => {
    await expect(
      S.recordAttendance(teacherA, { sessionId, studentId: outsiderId, status: "absent" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("تسجيل غياب واحد يشتق «غياب جزئي» في ملخص اليوم", async () => {
    await S.recordAttendance(teacherA, { sessionId, studentId: studentIds[0]!, status: "absent" });
    const d = await prisma!.dailySummary.findUnique({
      where: { studentId_date: { studentId: studentIds[0]!, date: DAY } },
    });
    expect(d?.status).toBe("partial");
    expect(d?.absentCount).toBe(1);
  });

  it("«الكل حاضر» يعبّئ الباقي دون مسّ الغائب", async () => {
    const r = await S.markAllPresent(teacherA, sessionId);
    expect(r.marked).toBe(2);
    const entries = await prisma!.attendanceEntry.findMany({ where: { lessonSessionId: sessionId } });
    expect(entries.find((e) => e.studentId === studentIds[0])?.status).toBe("absent");
    expect(entries.filter((e) => e.status === "present")).toHaveLength(2);
  });

  it("الاعتماد يقفل الجلسة ويثبت حالة الطلاب", async () => {
    await S.submitSession(teacherA, sessionId);
    const s = await prisma!.lessonSession.findUnique({ where: { id: sessionId } });
    expect(s?.status).toBe("submitted");
    await expect(
      S.recordAttendance(teacherA, { sessionId, studentId: studentIds[1]!, status: "late" }),
    ).rejects.toBeInstanceOf(S.StateError);
  });

  it("سحب الإسناد يمنع الكتابة فوراً في جلسة جديدة", async () => {
    await prisma!.teachingAssignment.updateMany({
      where: { teacherId: teacherA.userId, classId },
      data: { isActive: false },
    });
    const DAY2 = new Date(Date.UTC(2026, 10, 8));
    const s2 = await S.ensureSession(teacherA, slotId, DAY2); // الفتح يعتمد الخانة لا الإسناد
    await expect(
      S.recordAttendance(teacherA, { sessionId: s2.id, studentId: studentIds[0]!, status: "absent" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await prisma!.teachingAssignment.updateMany({
      where: { teacherId: teacherA.userId, classId },
      data: { isActive: true },
    });
  });

  it("فحص الإصدار يمنع الكتابة المتعارضة", async () => {
    const DAY3 = new Date(Date.UTC(2026, 10, 15));
    const s3 = await S.ensureSession(teacherA, slotId, DAY3);
    await expect(
      S.recordAttendance(teacherA, {
        sessionId: s3.id, studentId: studentIds[0]!, status: "absent", expectedRevision: 99,
      }),
    ).rejects.toBeInstanceOf(S.ConflictError);
  });

  it("كل تغيير مسجل في سجل التدقيق", async () => {
    const audits = await prisma!.auditEvent.count({
      where: { actorId: teacherA.userId, action: { startsWith: "attendance" } },
    });
    expect(audits).toBeGreaterThan(0);
  });

  it("جلسة غير موجودة ترمي NotFound", async () => {
    await expect(S.sessionRoster(teacherA, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});

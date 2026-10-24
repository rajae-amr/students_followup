/**
 * خدمة الحصص والحضور — القلب التشغيلي للنظام.
 *
 * قواعد ثابتة:
 * - المعلم لا يكتب إلا في حصة مسندة إليه، ويُعاد الفحص عند كل كتابة.
 * - الحصة غير المرصودة تبقى بلا سجل — لا وراثة من حالة اليوم.
 * - السلوك لا ينشئ حضوراً.
 * - اعتماد الحصة يثبت «حاضر» لبقية كشف الطلاب (isAssumed) دون مسّ الاستثناءات.
 * - إرسال الحالة صريح، لا toggle في الخادم.
 */

import { prisma, Prisma } from "@app/db";
import { ForbiddenError, NotFoundError, requireActive } from "../permissions";
import type { Actor } from "../permissions";
import {
  deriveDayStatus,
  type DerivePolicy,
  type LessonAttendance,
} from "./derive";

export class ConflictError extends Error {
  constructor(message = "تعارض في الإصدار — أعد التحميل") {
    super(message);
    this.name = "ConflictError";
  }
}

export class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateError";
  }
}

type Db = Prisma.TransactionClient | typeof prisma;

async function loadPolicy(tx: Db): Promise<DerivePolicy> {
  const s = await tx.schoolSettings.findUnique({ where: { id: "school" } });
  return {
    absentFullDayThreshold: s?.absentFullDayThreshold ?? 3,
    excusedFullDayThreshold: s?.excusedFullDayThreshold ?? 3,
  };
}

/** يوم الأسبوع بترميز المدرسة: 0=الأحد (JS getDay: 0=الأحد أيضاً) */
function schoolWeekday(date: Date): number {
  return date.getDay();
}

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** حصص معلم في تاريخ معيّن مع حالة كل جلسة */
export async function lessonsForTeacher(actor: Actor, date: Date) {
  requireActive(actor);
  const day = dateOnly(date);
  const weekday = schoolWeekday(day);
  // الإدارة ترى كل حصص اليوم — إشرافاً أو تسجيلاً نيابة عن معلم غائب
  const scope = actor.role === "teacher" ? { teacherId: actor.userId } : {};

  const slots = await prisma.timetableSlot.findMany({
    where: {
      ...scope,
      weekday,
      effectiveFrom: { lte: day },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
    },
    include: {
      class: { select: { id: true, displayName: true } },
      subject: { select: { id: true, name: true } },
    },
    orderBy: { period: "asc" },
  });

  const sessions = await prisma.lessonSession.findMany({
    where: { ...scope, date: day },
    include: { _count: { select: { entries: true } } },
  });
  const byKey = new Map(
    sessions.map((s) => [`${s.classId}:${s.period}`, s] as const),
  );

  // عدد طلاب كل صف لإظهار تقدّم الرصد
  const classIds = [...new Set(slots.map((s) => s.classId))];
  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  const roster = year
    ? await prisma.enrollment.groupBy({
        by: ["classId"],
        where: {
          classId: { in: classIds },
          academicYearId: year.id,
          student: { isActive: true },
        },
        _count: { studentId: true },
      })
    : [];
  const rosterCount = new Map(roster.map((r) => [r.classId, r._count.studentId]));

  // أسماء المعلمين — للعرض الإشرافي (teacherId بلا علاقة في المخطط)
  const teacherNames =
    actor.role === "teacher"
      ? new Map<string, string>()
      : new Map(
          (
            await prisma.user.findMany({
              where: { id: { in: [...new Set(slots.map((s) => s.teacherId))] } },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name] as const),
        );

  return slots.map((slot) => {
    const session = byKey.get(`${slot.classId}:${slot.period}`);
    return {
      slotId: slot.id,
      period: slot.period,
      classId: slot.classId,
      className: slot.class.displayName,
      subjectId: slot.subjectId,
      subjectName: slot.subject.name,
      teacherId: slot.teacherId,
      teacherName: teacherNames.get(slot.teacherId) ?? null,
      sessionId: session?.id ?? null,
      sessionStatus: session?.status ?? null,
      recordedCount: session?._count.entries ?? 0,
      rosterCount: rosterCount.get(slot.classId) ?? 0,
    };
  });
}

/**
 * التحقق من ملكية المعلم للحصة — يُستدعى عند كل كتابة.
 * الإدارة تتجاوز الملكية لكن لا تتجاوز حالة الجلسة.
 */
async function assertSessionWritable(
  tx: Db,
  actor: Actor,
  sessionId: string,
) {
  const session = await tx.lessonSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new NotFoundError("الحصة غير موجودة");

  if (actor.role === "teacher") {
    if (session.teacherId !== actor.userId) throw new ForbiddenError();
    // إعادة فحص الإسناد الحالي — السحب أثناء الجلسة يمنع الحفظ
    const year = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    const assignment = year
      ? await tx.teachingAssignment.findFirst({
          where: {
            teacherId: actor.userId,
            classId: session.classId,
            subjectId: session.subjectId,
            academicYearId: year.id,
            isActive: true,
          },
        })
      : null;
    if (!assignment) throw new ForbiddenError("أُلغي إسنادك لهذه الحصة");
  }

  if (session.status === "submitted" || session.status === "cancelled") {
    throw new StateError(
      session.status === "submitted"
        ? "الحصة معتمدة — تتطلب إعادة فتح من الإدارة"
        : "الحصة ملغاة",
    );
  }
  return session;
}

/** إنشاء جلسة حصة إن لم توجد (planned → draft) */
export async function ensureSession(
  actor: Actor,
  slotId: string,
  date: Date,
) {
  requireActive(actor);
  const day = dateOnly(date);

  const slot = await prisma.timetableSlot.findUnique({
    where: { id: slotId },
  });
  if (!slot) throw new NotFoundError("الحصة المجدولة غير موجودة");
  if (slot.weekday !== schoolWeekday(day))
    throw new ForbiddenError("الحصة ليست في هذا اليوم");
  if (slot.effectiveFrom > day || (slot.effectiveTo && slot.effectiveTo < day))
    throw new ForbiddenError("الإسناد غير سارٍ في هذا التاريخ");
  if (actor.role === "teacher" && slot.teacherId !== actor.userId)
    throw new ForbiddenError();

  const existing = await prisma.lessonSession.findUnique({
    where: {
      classId_date_period: { classId: slot.classId, date: day, period: slot.period },
    },
  });
  if (existing) return existing;

  return prisma.lessonSession.create({
    data: {
      date: day,
      period: slot.period,
      classId: slot.classId,
      subjectId: slot.subjectId,
      teacherId: slot.teacherId, // المصدر التاريخي للإسناد
      timetableSlotId: slot.id,
      status: "draft",
    },
  });
}

/**
 * تسجيل حالة طالب في حصة — صريح، يزيد revision، ويعيد حساب ملخص اليوم.
 */
export async function recordAttendance(
  actor: Actor,
  input: {
    sessionId: string;
    studentId: string;
    status: LessonAttendance;
    expectedRevision?: number;
    idempotencyKey?: string;
  },
) {
  requireActive(actor);
  if (!["present", "absent", "excused", "late"].includes(input.status))
    throw new StateError("حالة غير صالحة");

  return prisma.$transaction(async (tx) => {
    const session = await assertSessionWritable(tx, actor, input.sessionId);

    // الطالب يجب أن يكون في كشف الصف
    const year = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    const enrolled = year
      ? await tx.enrollment.findFirst({
          where: {
            studentId: input.studentId,
            classId: session.classId,
            academicYearId: year.id,
          },
        })
      : null;
    if (!enrolled) throw new ForbiddenError("الطالب ليس في كشف هذا الصف");

    const existing = await tx.attendanceEntry.findUnique({
      where: {
        lessonSessionId_studentId: {
          lessonSessionId: input.sessionId,
          studentId: input.studentId,
        },
      },
    });
    if (
      input.expectedRevision !== undefined &&
      (existing?.revision ?? 0) !== input.expectedRevision
    ) {
      throw new ConflictError();
    }

    const before = existing;
    const entry = await tx.attendanceEntry.upsert({
      where: {
        lessonSessionId_studentId: {
          lessonSessionId: input.sessionId,
          studentId: input.studentId,
        },
      },
      create: {
        lessonSessionId: input.sessionId,
        studentId: input.studentId,
        status: input.status,
        isAssumed: false,
        recordedById: actor.userId,
      },
      update: {
        status: input.status,
        isAssumed: false, // تعديل صريح يلغي طبيعة "المفترض"
        recordedById: actor.userId,
        revision: { increment: 1 },
      },
    });

    await tx.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: "attendance.record",
        entityType: "AttendanceEntry",
        entityId: entry.id,
        before: before ? { status: before.status } : Prisma.JsonNull,
        after: { status: entry.status },
      },
    });

    await recomputeDaily(tx, input.studentId, session.date);
    return entry;
  });
}

/**
 * اعتماد الحصة: يثبت «حاضر» مفترضاً لكل طالب بلا سجل،
 * ولا يمسّ أي استثناء مسجّل. ذرّي بالكامل.
 */
export async function submitSession(actor: Actor, sessionId: string) {
  requireActive(actor);
  return prisma.$transaction(async (tx) => {
    const session = await assertSessionWritable(tx, actor, sessionId);

    const year = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!year) throw new StateError("لا يوجد عام دراسي حالي");

    const students = await tx.enrollment.findMany({
      where: {
        classId: session.classId,
        academicYearId: year.id,
        student: { isActive: true },
      },
      select: { studentId: true },
    });

    const recorded = await tx.attendanceEntry.findMany({
      where: { lessonSessionId: sessionId },
      select: { studentId: true },
    });
    const recordedSet = new Set(recorded.map((r) => r.studentId));
    const missing = students.filter((s) => !recordedSet.has(s.studentId));

    if (missing.length) {
      await tx.attendanceEntry.createMany({
        data: missing.map((s) => ({
          lessonSessionId: sessionId,
          studentId: s.studentId,
          status: "present" as const,
          isAssumed: true,
          recordedById: actor.userId,
        })),
      });
    }

    const updated = await tx.lessonSession.update({
      where: { id: sessionId },
      data: {
        status: "submitted",
        submittedById: actor.userId,
        submittedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await tx.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: "lesson.submit",
        entityType: "LessonSession",
        entityId: sessionId,
        after: { assumedPresent: missing.length },
      },
    });

    for (const s of students) await recomputeDaily(tx, s.studentId, session.date);
    return updated;
  });
}

/**
 * «الكل حاضر»: يثبت حاضراً صريحاً لمن لا سجل له — لا يمسّ استثناءً مسجلاً.
 */
export async function markAllPresent(actor: Actor, sessionId: string) {
  requireActive(actor);
  return prisma.$transaction(async (tx) => {
    const session = await assertSessionWritable(tx, actor, sessionId);

    const year = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!year) throw new StateError("لا يوجد عام دراسي حالي");

    const students = await tx.enrollment.findMany({
      where: {
        classId: session.classId,
        academicYearId: year.id,
        student: { isActive: true },
      },
      select: { studentId: true },
    });
    const recorded = await tx.attendanceEntry.findMany({
      where: { lessonSessionId: sessionId },
      select: { studentId: true },
    });
    const recordedSet = new Set(recorded.map((r) => r.studentId));
    const missing = students.filter((s) => !recordedSet.has(s.studentId));

    if (missing.length) {
      await tx.attendanceEntry.createMany({
        data: missing.map((s) => ({
          lessonSessionId: sessionId,
          studentId: s.studentId,
          status: "present" as const,
          isAssumed: false,
          recordedById: actor.userId,
        })),
      });
      for (const s of missing) await recomputeDaily(tx, s.studentId, session.date);
    }
    return { marked: missing.length };
  });
}

/** إزالة سجل طالب (تصحيح) — يعيده إلى «غير مرصود» */
export async function clearAttendance(
  actor: Actor,
  input: { sessionId: string; studentId: string; expectedRevision?: number },
) {
  requireActive(actor);
  return prisma.$transaction(async (tx) => {
    const session = await assertSessionWritable(tx, actor, input.sessionId);
    const existing = await tx.attendanceEntry.findUnique({
      where: {
        lessonSessionId_studentId: {
          lessonSessionId: input.sessionId,
          studentId: input.studentId,
        },
      },
    });
    if (
      input.expectedRevision !== undefined &&
      (existing?.revision ?? 0) !== input.expectedRevision
    )
      throw new ConflictError();
    if (existing) {
      await tx.attendanceEntry.delete({ where: { id: existing.id } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: "attendance.clear",
          entityType: "AttendanceEntry",
          entityId: existing.id,
          before: { status: existing.status },
        },
      });
      await recomputeDaily(tx, input.studentId, session.date);
    }
  });
}

/** كشف الحصة: طلاب الصف + سجلهم الحالي + حالة الجلسة */
export async function sessionRoster(actor: Actor, sessionId: string) {
  requireActive(actor);
  const session = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: {
      class: { select: { displayName: true } },
      subject: { select: { name: true } },
    },
  });
  if (!session) throw new NotFoundError("الحصة غير موجودة");
  if (actor.role === "teacher" && session.teacherId !== actor.userId)
    throw new ForbiddenError();
  if (actor.role === "guardian") throw new ForbiddenError();

  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  const students = year
    ? await prisma.enrollment.findMany({
        where: {
          classId: session.classId,
          academicYearId: year.id,
          student: { isActive: true },
        },
        include: { student: { select: { id: true, fullName: true } } },
        orderBy: { student: { fullName: "asc" } },
      })
    : [];

  const entries = await prisma.attendanceEntry.findMany({
    where: { lessonSessionId: sessionId },
    select: { studentId: true, status: true, revision: true, isAssumed: true },
  });
  const entryMap = new Map(entries.map((e) => [e.studentId, e]));

  return {
    session: {
      id: session.id,
      date: session.date,
      period: session.period,
      status: session.status,
      version: session.version,
      className: session.class.displayName,
      subjectName: session.subject.name,
    },
    students: students.map((e) => {
      const entry = entryMap.get(e.studentId);
      return {
        studentId: e.student.id,
        fullName: e.student.fullName,
        status: (entry?.status ?? null) as LessonAttendance | null,
        revision: entry?.revision ?? 0,
        isAssumed: entry?.isAssumed ?? false,
      };
    }),
  };
}

/** إعادة حساب ملخص اليوم لطالب — من سجلات الحصص المرصودة فقط */
export async function recomputeDaily(
  tx: Db,
  studentId: string,
  date: Date,
  policy?: DerivePolicy,
) {
  const day = dateOnly(date);
  const entries = await tx.attendanceEntry.findMany({
    where: { studentId, lessonSession: { date: day } },
    select: { status: true },
  });
  const expected = await tx.lessonSession.count({
    where: { date: day, class: { students: { some: { studentId } } } },
  });

  const p = policy ?? (await loadPolicy(tx));
  const d = deriveDayStatus(
    entries.map((e) => e.status),
    p,
  );

  await tx.dailySummary.upsert({
    where: { studentId_date: { studentId, date: day } },
    create: {
      studentId,
      date: day,
      status: d.status,
      absentCount: d.absentCount,
      excusedCount: d.excusedCount,
      lateCount: d.lateCount,
      recordedCount: d.recordedCount,
      expectedCount: expected,
    },
    update: {
      status: d.status,
      absentCount: d.absentCount,
      excusedCount: d.excusedCount,
      lateCount: d.lateCount,
      recordedCount: d.recordedCount,
      expectedCount: expected,
      computedAt: new Date(),
    },
  });

  // تنبيه آلي اختياري — عند اكتمال حالة الغياب/الاستئذان يُدرج إشعار
  // بمفتاح عدم تكرار مطابق للإرسال اليدوي (لا ازدواجية بين المسارين)
  if (d.status === "absent" || d.status === "excused") {
    const s = await tx.schoolSettings.findUnique({
      where: { id: "school" },
      select: { autoAbsenceAlert: true },
    });
    if (!s?.autoAbsenceAlert) return;
    const student = await tx.student.findUnique({
      where: { id: studentId },
      include: {
        guardians: {
          where: { verified: true },
          include: { guardian: { include: { user: true } } },
        },
      },
    });
    if (!student) return;
    const dateStr = day.toISOString().slice(0, 10);
    for (const g of student.guardians) {
      const chatId = g.guardian.user.telegramChatId;
      const key = `absence:${studentId}:${dateStr}:g:${g.guardianId}`;
      await tx.outboxEvent.upsert({
        where: { idempotencyKey: key },
        create: {
          type: "absence_alert",
          channel: chatId ? "telegram" : "portal",
          idempotencyKey: key,
          payload: {
            studentId,
            guardianId: g.guardianId,
            studentName: student.fullName,
            date: dateStr,
            status: d.status,
            telegramChatId: chatId,
          },
        },
        update: {},
      });
    }
  }
}

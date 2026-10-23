var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res2) => function __init() {
  return fn && (res2 = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res2;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../packages/db/src/index.ts
var src_exports = {};
__export(src_exports, {
  prisma: () => prisma
});
import { PrismaClient } from "@prisma/client";
import * as client_star from "@prisma/client";
var globalForPrisma, prisma;
var init_src = __esm({
  "../../packages/db/src/index.ts"() {
    "use strict";
    __reExport(src_exports, client_star);
    globalForPrisma = globalThis;
    prisma = globalForPrisma.prisma ?? new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
  }
});

// ../../packages/core/src/attendance/derive.ts
function deriveDayStatus(records, policy = DEFAULT_POLICY) {
  const counts = { absent: 0, excused: 0, late: 0, present: 0 };
  for (const r of records) counts[r] += 1;
  const recordedCount = records.length;
  let status;
  if (recordedCount === 0) {
    status = "unknown";
  } else if (counts.absent >= policy.absentFullDayThreshold) {
    status = "absent";
  } else if (counts.excused >= policy.excusedFullDayThreshold) {
    status = "excused";
  } else if (counts.absent > 0 || counts.excused > 0) {
    status = "partial";
  } else if (counts.late > 0) {
    status = "late";
  } else {
    status = "present";
  }
  return {
    status,
    absentCount: counts.absent,
    excusedCount: counts.excused,
    lateCount: counts.late,
    presentCount: counts.present,
    recordedCount
  };
}
var DEFAULT_POLICY, DAY_STATUS_AR, LESSON_STATUS_AR;
var init_derive = __esm({
  "../../packages/core/src/attendance/derive.ts"() {
    "use strict";
    DEFAULT_POLICY = {
      absentFullDayThreshold: 3,
      excusedFullDayThreshold: 3
    };
    DAY_STATUS_AR = {
      present: "\u062D\u0627\u0636\u0631",
      absent: "\u063A\u0627\u0626\u0628",
      excused: "\u063A\u0627\u0626\u0628 \u0628\u0639\u0630\u0631",
      partial: "\u063A\u064A\u0627\u0628 \u062C\u0632\u0626\u064A",
      late: "\u0645\u062A\u0623\u062E\u0631",
      unknown: "\u2014"
    };
    LESSON_STATUS_AR = {
      present: "\u062D\u0627\u0636\u0631",
      absent: "\u063A\u064A\u0627\u0628",
      excused: "\u0627\u0633\u062A\u0626\u0630\u0627\u0646",
      late: "\u062A\u0623\u062E\u064A\u0631"
    };
  }
});

// ../../packages/core/src/attendance/index.ts
var init_attendance = __esm({
  "../../packages/core/src/attendance/index.ts"() {
    "use strict";
    init_derive();
  }
});

// ../../packages/core/src/permissions/index.ts
function requireActive(actor) {
  if (!actor.isActive) throw new ForbiddenError("\u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0648\u0642\u0648\u0641");
}
function requireAdmin(actor) {
  requireActive(actor);
  if (actor.role !== "admin") throw new ForbiddenError();
}
function requireTeacher(actor) {
  requireActive(actor);
  if (actor.role !== "teacher" && actor.role !== "admin")
    throw new ForbiddenError();
}
function requireGuardian(actor) {
  requireActive(actor);
  if (actor.role !== "guardian") throw new ForbiddenError();
}
var ForbiddenError, NotFoundError;
var init_permissions = __esm({
  "../../packages/core/src/permissions/index.ts"() {
    "use strict";
    ForbiddenError = class extends Error {
      constructor(message = "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0628\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621") {
        super(message);
        this.name = "ForbiddenError";
      }
    };
    NotFoundError = class extends Error {
      constructor(message = "\u0627\u0644\u0639\u0646\u0635\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F") {
        super(message);
        this.name = "NotFoundError";
      }
    };
  }
});

// ../../packages/core/src/attendance/service.ts
async function loadPolicy(tx) {
  const s2 = await tx.schoolSettings.findUnique({ where: { id: "school" } });
  return {
    absentFullDayThreshold: s2?.absentFullDayThreshold ?? 3,
    excusedFullDayThreshold: s2?.excusedFullDayThreshold ?? 3
  };
}
function schoolWeekday(date) {
  return date.getDay();
}
function dateOnly(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
async function lessonsForTeacher(actor, date) {
  requireActive(actor);
  const day = dateOnly(date);
  const weekday = schoolWeekday(day);
  const slots = await prisma.timetableSlot.findMany({
    where: {
      teacherId: actor.userId,
      weekday,
      effectiveFrom: { lte: day },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }]
    },
    include: {
      class: { select: { id: true, displayName: true } },
      subject: { select: { id: true, name: true } }
    },
    orderBy: { period: "asc" }
  });
  const sessions = await prisma.lessonSession.findMany({
    where: { teacherId: actor.userId, date: day },
    include: { _count: { select: { entries: true } } }
  });
  const byKey = new Map(
    sessions.map((s2) => [`${s2.classId}:${s2.period}`, s2])
  );
  const classIds = [...new Set(slots.map((s2) => s2.classId))];
  const year2 = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true }
  });
  const roster = year2 ? await prisma.enrollment.groupBy({
    by: ["classId"],
    where: {
      classId: { in: classIds },
      academicYearId: year2.id,
      student: { isActive: true }
    },
    _count: { studentId: true }
  }) : [];
  const rosterCount = new Map(roster.map((r) => [r.classId, r._count.studentId]));
  return slots.map((slot) => {
    const session = byKey.get(`${slot.classId}:${slot.period}`);
    return {
      slotId: slot.id,
      period: slot.period,
      classId: slot.classId,
      className: slot.class.displayName,
      subjectId: slot.subjectId,
      subjectName: slot.subject.name,
      sessionId: session?.id ?? null,
      sessionStatus: session?.status ?? null,
      recordedCount: session?._count.entries ?? 0,
      rosterCount: rosterCount.get(slot.classId) ?? 0
    };
  });
}
async function assertSessionWritable(tx, actor, sessionId) {
  const session = await tx.lessonSession.findUnique({
    where: { id: sessionId }
  });
  if (!session) throw new NotFoundError("\u0627\u0644\u062D\u0635\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (actor.role === "teacher") {
    if (session.teacherId !== actor.userId) throw new ForbiddenError();
    const year2 = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true }
    });
    const assignment = year2 ? await tx.teachingAssignment.findFirst({
      where: {
        teacherId: actor.userId,
        classId: session.classId,
        subjectId: session.subjectId,
        academicYearId: year2.id,
        isActive: true
      }
    }) : null;
    if (!assignment) throw new ForbiddenError("\u0623\u064F\u0644\u063A\u064A \u0625\u0633\u0646\u0627\u062F\u0643 \u0644\u0647\u0630\u0647 \u0627\u0644\u062D\u0635\u0629");
  }
  if (session.status === "submitted" || session.status === "cancelled") {
    throw new StateError(
      session.status === "submitted" ? "\u0627\u0644\u062D\u0635\u0629 \u0645\u0639\u062A\u0645\u062F\u0629 \u2014 \u062A\u062A\u0637\u0644\u0628 \u0625\u0639\u0627\u062F\u0629 \u0641\u062A\u062D \u0645\u0646 \u0627\u0644\u0625\u062F\u0627\u0631\u0629" : "\u0627\u0644\u062D\u0635\u0629 \u0645\u0644\u063A\u0627\u0629"
    );
  }
  return session;
}
async function ensureSession(actor, slotId, date) {
  requireActive(actor);
  const day = dateOnly(date);
  const slot = await prisma.timetableSlot.findUnique({
    where: { id: slotId }
  });
  if (!slot) throw new NotFoundError("\u0627\u0644\u062D\u0635\u0629 \u0627\u0644\u0645\u062C\u062F\u0648\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (slot.weekday !== schoolWeekday(day))
    throw new ForbiddenError("\u0627\u0644\u062D\u0635\u0629 \u0644\u064A\u0633\u062A \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u064A\u0648\u0645");
  if (slot.effectiveFrom > day || slot.effectiveTo && slot.effectiveTo < day)
    throw new ForbiddenError("\u0627\u0644\u0625\u0633\u0646\u0627\u062F \u063A\u064A\u0631 \u0633\u0627\u0631\u064D \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u062A\u0627\u0631\u064A\u062E");
  if (actor.role === "teacher" && slot.teacherId !== actor.userId)
    throw new ForbiddenError();
  const existing = await prisma.lessonSession.findUnique({
    where: {
      classId_date_period: { classId: slot.classId, date: day, period: slot.period }
    }
  });
  if (existing) return existing;
  return prisma.lessonSession.create({
    data: {
      date: day,
      period: slot.period,
      classId: slot.classId,
      subjectId: slot.subjectId,
      teacherId: slot.teacherId,
      // المصدر التاريخي للإسناد
      timetableSlotId: slot.id,
      status: "draft"
    }
  });
}
async function recordAttendance(actor, input) {
  requireActive(actor);
  if (!["present", "absent", "excused", "late"].includes(input.status))
    throw new StateError("\u062D\u0627\u0644\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629");
  return prisma.$transaction(async (tx) => {
    const session = await assertSessionWritable(tx, actor, input.sessionId);
    const year2 = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true }
    });
    const enrolled = year2 ? await tx.enrollment.findFirst({
      where: {
        studentId: input.studentId,
        classId: session.classId,
        academicYearId: year2.id
      }
    }) : null;
    if (!enrolled) throw new ForbiddenError("\u0627\u0644\u0637\u0627\u0644\u0628 \u0644\u064A\u0633 \u0641\u064A \u0643\u0634\u0641 \u0647\u0630\u0627 \u0627\u0644\u0635\u0641");
    const existing = await tx.attendanceEntry.findUnique({
      where: {
        lessonSessionId_studentId: {
          lessonSessionId: input.sessionId,
          studentId: input.studentId
        }
      }
    });
    if (input.expectedRevision !== void 0 && (existing?.revision ?? 0) !== input.expectedRevision) {
      throw new ConflictError();
    }
    const before = existing;
    const entry = await tx.attendanceEntry.upsert({
      where: {
        lessonSessionId_studentId: {
          lessonSessionId: input.sessionId,
          studentId: input.studentId
        }
      },
      create: {
        lessonSessionId: input.sessionId,
        studentId: input.studentId,
        status: input.status,
        isAssumed: false,
        recordedById: actor.userId
      },
      update: {
        status: input.status,
        isAssumed: false,
        // تعديل صريح يلغي طبيعة "المفترض"
        recordedById: actor.userId,
        revision: { increment: 1 }
      }
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: "attendance.record",
        entityType: "AttendanceEntry",
        entityId: entry.id,
        before: before ? { status: before.status } : src_exports.Prisma.JsonNull,
        after: { status: entry.status }
      }
    });
    await recomputeDaily(tx, input.studentId, session.date);
    return entry;
  });
}
async function submitSession(actor, sessionId) {
  requireActive(actor);
  return prisma.$transaction(async (tx) => {
    const session = await assertSessionWritable(tx, actor, sessionId);
    const year2 = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true }
    });
    if (!year2) throw new StateError("\u0644\u0627 \u064A\u0648\u062C\u062F \u0639\u0627\u0645 \u062F\u0631\u0627\u0633\u064A \u062D\u0627\u0644\u064A");
    const students = await tx.enrollment.findMany({
      where: {
        classId: session.classId,
        academicYearId: year2.id,
        student: { isActive: true }
      },
      select: { studentId: true }
    });
    const recorded = await tx.attendanceEntry.findMany({
      where: { lessonSessionId: sessionId },
      select: { studentId: true }
    });
    const recordedSet = new Set(recorded.map((r) => r.studentId));
    const missing = students.filter((s2) => !recordedSet.has(s2.studentId));
    if (missing.length) {
      await tx.attendanceEntry.createMany({
        data: missing.map((s2) => ({
          lessonSessionId: sessionId,
          studentId: s2.studentId,
          status: "present",
          isAssumed: true,
          recordedById: actor.userId
        }))
      });
    }
    const updated = await tx.lessonSession.update({
      where: { id: sessionId },
      data: {
        status: "submitted",
        submittedById: actor.userId,
        submittedAt: /* @__PURE__ */ new Date(),
        version: { increment: 1 }
      }
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: "lesson.submit",
        entityType: "LessonSession",
        entityId: sessionId,
        after: { assumedPresent: missing.length }
      }
    });
    for (const s2 of students) await recomputeDaily(tx, s2.studentId, session.date);
    return updated;
  });
}
async function markAllPresent(actor, sessionId) {
  requireActive(actor);
  return prisma.$transaction(async (tx) => {
    const session = await assertSessionWritable(tx, actor, sessionId);
    const year2 = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true }
    });
    if (!year2) throw new StateError("\u0644\u0627 \u064A\u0648\u062C\u062F \u0639\u0627\u0645 \u062F\u0631\u0627\u0633\u064A \u062D\u0627\u0644\u064A");
    const students = await tx.enrollment.findMany({
      where: {
        classId: session.classId,
        academicYearId: year2.id,
        student: { isActive: true }
      },
      select: { studentId: true }
    });
    const recorded = await tx.attendanceEntry.findMany({
      where: { lessonSessionId: sessionId },
      select: { studentId: true }
    });
    const recordedSet = new Set(recorded.map((r) => r.studentId));
    const missing = students.filter((s2) => !recordedSet.has(s2.studentId));
    if (missing.length) {
      await tx.attendanceEntry.createMany({
        data: missing.map((s2) => ({
          lessonSessionId: sessionId,
          studentId: s2.studentId,
          status: "present",
          isAssumed: false,
          recordedById: actor.userId
        }))
      });
      for (const s2 of missing) await recomputeDaily(tx, s2.studentId, session.date);
    }
    return { marked: missing.length };
  });
}
async function clearAttendance(actor, input) {
  requireActive(actor);
  return prisma.$transaction(async (tx) => {
    const session = await assertSessionWritable(tx, actor, input.sessionId);
    const existing = await tx.attendanceEntry.findUnique({
      where: {
        lessonSessionId_studentId: {
          lessonSessionId: input.sessionId,
          studentId: input.studentId
        }
      }
    });
    if (input.expectedRevision !== void 0 && (existing?.revision ?? 0) !== input.expectedRevision)
      throw new ConflictError();
    if (existing) {
      await tx.attendanceEntry.delete({ where: { id: existing.id } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: "attendance.clear",
          entityType: "AttendanceEntry",
          entityId: existing.id,
          before: { status: existing.status }
        }
      });
      await recomputeDaily(tx, input.studentId, session.date);
    }
  });
}
async function sessionRoster(actor, sessionId) {
  requireActive(actor);
  const session = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: {
      class: { select: { displayName: true } },
      subject: { select: { name: true } }
    }
  });
  if (!session) throw new NotFoundError("\u0627\u0644\u062D\u0635\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (actor.role === "teacher" && session.teacherId !== actor.userId)
    throw new ForbiddenError();
  if (actor.role === "guardian") throw new ForbiddenError();
  const year2 = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true }
  });
  const students = year2 ? await prisma.enrollment.findMany({
    where: {
      classId: session.classId,
      academicYearId: year2.id,
      student: { isActive: true }
    },
    include: { student: { select: { id: true, fullName: true } } },
    orderBy: { student: { fullName: "asc" } }
  }) : [];
  const entries = await prisma.attendanceEntry.findMany({
    where: { lessonSessionId: sessionId },
    select: { studentId: true, status: true, revision: true, isAssumed: true }
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
      subjectName: session.subject.name
    },
    students: students.map((e) => {
      const entry = entryMap.get(e.studentId);
      return {
        studentId: e.student.id,
        fullName: e.student.fullName,
        status: entry?.status ?? null,
        revision: entry?.revision ?? 0,
        isAssumed: entry?.isAssumed ?? false
      };
    })
  };
}
async function recomputeDaily(tx, studentId, date, policy) {
  const day = dateOnly(date);
  const entries = await tx.attendanceEntry.findMany({
    where: { studentId, lessonSession: { date: day } },
    select: { status: true }
  });
  const expected = await tx.lessonSession.count({
    where: { date: day, class: { students: { some: { studentId } } } }
  });
  const p = policy ?? await loadPolicy(tx);
  const d = deriveDayStatus(
    entries.map((e) => e.status),
    p
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
      expectedCount: expected
    },
    update: {
      status: d.status,
      absentCount: d.absentCount,
      excusedCount: d.excusedCount,
      lateCount: d.lateCount,
      recordedCount: d.recordedCount,
      expectedCount: expected,
      computedAt: /* @__PURE__ */ new Date()
    }
  });
  if (d.status === "absent" || d.status === "excused") {
    const s2 = await tx.schoolSettings.findUnique({
      where: { id: "school" },
      select: { autoAbsenceAlert: true }
    });
    if (!s2?.autoAbsenceAlert) return;
    const student2 = await tx.student.findUnique({
      where: { id: studentId },
      include: {
        guardians: {
          where: { verified: true },
          include: { guardian: { include: { user: true } } }
        }
      }
    });
    if (!student2) return;
    const dateStr = day.toISOString().slice(0, 10);
    for (const g of student2.guardians) {
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
            studentName: student2.fullName,
            date: dateStr,
            status: d.status,
            telegramChatId: chatId
          }
        },
        update: {}
      });
    }
  }
}
var ConflictError, StateError;
var init_service = __esm({
  "../../packages/core/src/attendance/service.ts"() {
    "use strict";
    init_src();
    init_permissions();
    init_derive();
    ConflictError = class extends Error {
      constructor(message = "\u062A\u0639\u0627\u0631\u0636 \u0641\u064A \u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u2014 \u0623\u0639\u062F \u0627\u0644\u062A\u062D\u0645\u064A\u0644") {
        super(message);
        this.name = "ConflictError";
      }
    };
    StateError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "StateError";
      }
    };
  }
});

// ../../packages/core/src/services/behavior.ts
async function recordBehavior(actor, input) {
  requireTeacher(actor);
  if (!input.category && !input.text?.trim())
    throw new StateError("\u0623\u062F\u062E\u0644 \u062A\u0635\u0646\u064A\u0641\u0627\u064B \u0623\u0648 \u0646\u0635\u0627\u064B");
  if (input.category && !CATEGORIES.includes(input.category))
    throw new StateError("\u062A\u0635\u0646\u064A\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
  if (input.lessonSessionId) {
    const session = await prisma.lessonSession.findUnique({
      where: { id: input.lessonSessionId }
    });
    if (!session) throw new NotFoundError("\u0627\u0644\u062D\u0635\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    if (actor.role === "teacher" && session.teacherId !== actor.userId)
      throw new ForbiddenError();
  } else if (actor.role === "teacher") {
    const year2 = await prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true }
    });
    const allowed = year2 ? await prisma.enrollment.findFirst({
      where: {
        studentId: input.studentId,
        academicYearId: year2.id,
        class: {
          assignments: {
            some: { teacherId: actor.userId, isActive: true }
          }
        }
      }
    }) : null;
    if (!allowed) throw new ForbiddenError("\u0627\u0644\u0637\u0627\u0644\u0628 \u062E\u0627\u0631\u062C \u0646\u0637\u0627\u0642 \u062A\u062F\u0631\u064A\u0633\u0643");
  }
  const entry = await prisma.behaviorEntry.create({
    data: {
      studentId: input.studentId,
      date: input.date,
      lessonSessionId: input.lessonSessionId ?? null,
      period: null,
      teacherId: actor.userId,
      category: input.category ?? null,
      text: input.text?.trim() || null,
      audience: input.audience ?? "internal"
    }
  });
  await prisma.auditEvent.create({
    data: {
      actorId: actor.userId,
      action: "behavior.record",
      entityType: "BehaviorEntry",
      entityId: entry.id,
      after: { category: entry.category, audience: entry.audience }
    }
  });
  return entry;
}
async function addNote(actor, input) {
  requireTeacher(actor);
  if (!input.text.trim()) throw new StateError("\u0627\u0644\u0646\u0635 \u0645\u0637\u0644\u0648\u0628");
  const note = await prisma.note.create({
    data: {
      studentId: input.studentId,
      authorId: actor.userId,
      date: /* @__PURE__ */ new Date(),
      category: input.category ?? "free",
      text: input.text.trim(),
      audience: input.audience ?? "internal"
    }
  });
  await prisma.auditEvent.create({
    data: {
      actorId: actor.userId,
      action: "note.add",
      entityType: "Note",
      entityId: note.id
    }
  });
  return note;
}
var CATEGORIES, BEHAVIOR_AR;
var init_behavior = __esm({
  "../../packages/core/src/services/behavior.ts"() {
    "use strict";
    init_src();
    init_permissions();
    init_service();
    CATEGORIES = [
      "excellent",
      "committed",
      "needs_followup"
    ];
    BEHAVIOR_AR = {
      excellent: "\u0645\u0645\u062A\u0627\u0632",
      committed: "\u0645\u0644\u062A\u0632\u0645",
      needs_followup: "\u064A\u062D\u062A\u0627\u062C \u0645\u062A\u0627\u0628\u0639\u0629"
    };
  }
});

// ../../packages/core/src/services/grades.ts
async function currentYearId() {
  const y = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true }
  });
  if (!y) throw new StateError("\u0644\u0627 \u064A\u0648\u062C\u062F \u0639\u0627\u0645 \u062F\u0631\u0627\u0633\u064A \u062D\u0627\u0644\u064A");
  return y.id;
}
async function assertAssignment(actor, classId, subjectId) {
  if (actor.role === "admin") return;
  const yearId = await currentYearId();
  const a = await prisma.teachingAssignment.findFirst({
    where: {
      teacherId: actor.userId,
      classId,
      subjectId,
      academicYearId: yearId,
      isActive: true
    }
  });
  if (!a) throw new ForbiddenError("\u0647\u0630\u0627 \u0627\u0644\u0635\u0641/\u0627\u0644\u0645\u0627\u062F\u0629 \u062E\u0627\u0631\u062C \u0625\u0633\u0646\u0627\u062F\u0643");
}
async function createAssessment(actor, input) {
  requireTeacher(actor);
  if (!input.title.trim()) throw new StateError("\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0645\u0637\u0644\u0648\u0628");
  if (!(input.maxScore > 0)) throw new StateError("\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0639\u0638\u0645\u0649 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 > 0");
  await assertAssignment(actor, input.classId, input.subjectId);
  return prisma.assessment.create({
    data: {
      teacherId: actor.userId,
      classId: input.classId,
      subjectId: input.subjectId,
      termId: input.termId ?? null,
      title: input.title.trim(),
      kind: input.kind ?? "quiz",
      date: input.date,
      maxScore: input.maxScore
    }
  });
}
async function setGrade(actor, input) {
  requireTeacher(actor);
  const assessment = await prisma.assessment.findUnique({
    where: { id: input.assessmentId }
  });
  if (!assessment) throw new NotFoundError("\u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  if (actor.role === "teacher" && assessment.teacherId !== actor.userId)
    throw new ForbiddenError("\u062A\u0642\u064A\u064A\u0645 \u0645\u0639\u0644\u0645 \u0622\u062E\u0631 \u2014 \u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062A\u0639\u062F\u064A\u0644\u0647");
  if (input.score !== null) {
    if (input.score < 0 || input.score > assessment.maxScore)
      throw new StateError(`\u0627\u0644\u062F\u0631\u062C\u0629 \u0628\u064A\u0646 0 \u0648${assessment.maxScore}`);
  }
  const yearId = await currentYearId();
  const enrolled = await prisma.enrollment.findFirst({
    where: {
      studentId: input.studentId,
      classId: assessment.classId,
      academicYearId: yearId
    }
  });
  if (!enrolled) throw new ForbiddenError("\u0627\u0644\u0637\u0627\u0644\u0628 \u0644\u064A\u0633 \u0641\u064A \u0635\u0641 \u0647\u0630\u0627 \u0627\u0644\u062A\u0642\u064A\u064A\u0645");
  return prisma.grade.upsert({
    where: {
      assessmentId_studentId: {
        assessmentId: input.assessmentId,
        studentId: input.studentId
      }
    },
    create: {
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      score: input.score,
      note: input.note?.trim() || null
    },
    update: { score: input.score, note: input.note?.trim() || null }
  });
}
function defaultEvalValue(category) {
  return WEEKLY_EVAL_OPTIONS[category]?.[0] ?? "";
}
function weekStartOf(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d;
}
function letterFromPct(pct) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}
function academicStats(items) {
  const scored = items.filter(
    (i) => i.score != null && i.max > 0 && APPRECIATION_KINDS.has(i.kind)
  );
  if (!scored.length) return null;
  const pct = scored.reduce((sum, i) => sum + i.score / i.max * 100, 0) / scored.length;
  return { pct: Math.round(pct * 10) / 10, letter: letterFromPct(pct) };
}
async function setEvaluation(actor, input) {
  requireTeacher(actor);
  if (!input.category.trim() || !input.value.trim())
    throw new StateError("\u0627\u0644\u0628\u0646\u062F \u0648\u0627\u0644\u0642\u064A\u0645\u0629 \u0645\u0637\u0644\u0648\u0628\u0627\u0646");
  if (AUTO_EVAL_CATEGORIES.includes(input.category.trim()))
    throw new StateError("\u0647\u0630\u0627 \u0627\u0644\u0628\u0646\u062F \u064A\u064F\u062D\u0633\u0628 \u0622\u0644\u064A\u0627\u064B \u0645\u0646 \u0627\u0644\u062F\u0631\u062C\u0627\u062A \u2014 \u0644\u0627 \u064A\u064F\u062F\u062E\u0644 \u064A\u062F\u0648\u064A\u0627\u064B");
  const yearId = await currentYearId();
  const enrolled = await prisma.enrollment.findFirst({
    where: {
      studentId: input.studentId,
      academicYearId: yearId,
      class: {
        assignments: {
          some: {
            teacherId: actor.userId,
            subjectId: input.subjectId,
            isActive: true
          }
        }
      }
    }
  });
  if (actor.role === "teacher" && !enrolled)
    throw new ForbiddenError("\u0627\u0644\u0637\u0627\u0644\u0628 \u062E\u0627\u0631\u062C \u0646\u0637\u0627\u0642 \u062A\u062F\u0631\u064A\u0633\u0643 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0627\u062F\u0629");
  const existing = await prisma.evaluation.findFirst({
    where: {
      teacherId: actor.userId,
      subjectId: input.subjectId,
      studentId: input.studentId,
      termId: input.termId ?? null,
      weekStart: input.weekStart ?? null,
      category: input.category.trim()
    }
  });
  if (existing) {
    return prisma.evaluation.update({
      where: { id: existing.id },
      data: { value: input.value.trim() }
    });
  }
  return prisma.evaluation.create({
    data: {
      teacherId: actor.userId,
      subjectId: input.subjectId,
      studentId: input.studentId,
      termId: input.termId ?? null,
      weekStart: input.weekStart ?? null,
      category: input.category.trim(),
      value: input.value.trim()
    }
  });
}
async function assessmentsForTeacher(actor, filter) {
  requireTeacher(actor);
  return prisma.assessment.findMany({
    where: {
      ...actor.role === "teacher" ? { teacherId: actor.userId } : {},
      ...filter.classId ? { classId: filter.classId } : {},
      ...filter.subjectId ? { subjectId: filter.subjectId } : {}
    },
    include: {
      class: { select: { displayName: true } },
      subject: { select: { name: true } },
      _count: { select: { grades: true } }
    },
    orderBy: { date: "desc" }
  });
}
var WEEKLY_EVAL_CATEGORIES, AUTO_EVAL_CATEGORIES, WEEKLY_EVAL_OPTIONS, APPRECIATION_KINDS;
var init_grades = __esm({
  "../../packages/core/src/services/grades.ts"() {
    "use strict";
    init_src();
    init_permissions();
    init_service();
    WEEKLY_EVAL_CATEGORIES = ["\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629", "\u0643\u062A\u0627\u0628 \u0623", "\u0627\u0644\u0643\u062A\u0628"];
    AUTO_EVAL_CATEGORIES = ["\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629", "\u0627\u0644\u062A\u0642\u062F\u064A\u0631"];
    WEEKLY_EVAL_OPTIONS = {
      "\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629": ["\u0646\u0634\u0637", "\u0646\u0634\u0637 \u062C\u0632\u0626\u064A\u0627\u064B", "\u063A\u064A\u0631 \u0646\u0634\u0637"],
      "\u0643\u062A\u0627\u0628 \u0623": ["\u0641\u064A \u0627\u0644\u0645\u0648\u0639\u062F", "\u0645\u062A\u0623\u062E\u0631\u0627\u064B"],
      "\u0627\u0644\u0643\u062A\u0628": ["\u0645\u0647\u062A\u0645", "\u0645\u0647\u062A\u0645 \u062C\u0632\u0626\u064A\u0627\u064B", "\u063A\u064A\u0631 \u0645\u0647\u062A\u0645"]
    };
    APPRECIATION_KINDS = /* @__PURE__ */ new Set(["exam", "quiz"]);
  }
});

// ../../packages/core/src/services/reports.ts
async function buildStudentReport(actor, input) {
  requireActive(actor);
  if (actor.role === "guardian") {
    const profile2 = await prisma.guardianProfile.findUnique({
      where: { userId: actor.userId }
    });
    const link = profile2 ? await prisma.guardianStudent.findUnique({
      where: {
        guardianId_studentId: {
          guardianId: profile2.id,
          studentId: input.studentId
        }
      }
    }) : null;
    if (!link?.verified) throw new ForbiddenError();
  } else if (actor.role === "teacher") {
    const year2 = await prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true }
    });
    const allowed = year2 ? await prisma.enrollment.findFirst({
      where: {
        studentId: input.studentId,
        academicYearId: year2.id,
        class: {
          assignments: {
            some: { teacherId: actor.userId, isActive: true }
          }
        }
      }
    }) : null;
    if (!allowed) throw new ForbiddenError("\u0627\u0644\u0637\u0627\u0644\u0628 \u062E\u0627\u0631\u062C \u0646\u0637\u0627\u0642 \u062A\u062F\u0631\u064A\u0633\u0643");
  }
  const { studentId, rangeStart, rangeEnd } = input;
  const student2 = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        include: { class: { select: { displayName: true } } },
        take: 1
      }
    }
  });
  if (!student2) throw new NotFoundError("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  const settings = await prisma.schoolSettings.findUnique({
    where: { id: "school" }
  });
  const [summaries, entries, grades, evaluations, behavior] = await Promise.all([
    prisma.dailySummary.findMany({
      where: { studentId, date: { gte: rangeStart, lte: rangeEnd } }
    }),
    prisma.attendanceEntry.findMany({
      where: {
        studentId,
        status: { not: "present" },
        // الاستثناءات فقط — التقرير للمتابعة
        lessonSession: { date: { gte: rangeStart, lte: rangeEnd } }
      },
      include: {
        lessonSession: { include: { subject: { select: { name: true } } } }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.grade.findMany({
      where: {
        studentId,
        assessment: { date: { gte: rangeStart, lte: rangeEnd } }
      },
      include: {
        assessment: {
          include: {
            subject: { select: { name: true } }
          }
        }
      }
    }),
    prisma.evaluation.findMany({
      where: {
        studentId,
        // التقييمات أسبوعية — نأخذ أسابيع ضمن نطاق التقرير فقط
        weekStart: { gte: rangeStart, lte: rangeEnd }
      },
      include: {
        subject: { select: { name: true } }
      }
    }),
    prisma.behaviorEntry.findMany({
      where: {
        studentId,
        date: { gte: rangeStart, lte: rangeEnd },
        // ولي الأمر يرى المنشور للأسرة فقط
        ...actor.role === "guardian" ? { audience: "family" } : {}
      }
    })
  ]);
  const teacherIds = [
    .../* @__PURE__ */ new Set([
      ...grades.map((g) => g.assessment.teacherId),
      ...evaluations.map((e) => e.teacherId),
      ...behavior.map((b) => b.teacherId)
    ])
  ];
  const teachers = await prisma.user.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, name: true }
  });
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
  const byStatus = { absent: 0, excused: 0, partial: 0, late: 0, present: 0 };
  for (const s2 of summaries) {
    if (s2.status === "absent") byStatus.absent++;
    else if (s2.status === "excused") byStatus.excused++;
    else if (s2.status === "partial") byStatus.partial++;
    else if (s2.status === "late") byStatus.late++;
    else if (s2.status === "present") byStatus.present++;
  }
  const gradeGroups = /* @__PURE__ */ new Map();
  for (const g of grades) {
    const key = `${g.assessment.subjectId}:${g.assessment.teacherId}`;
    let group = gradeGroups.get(key);
    if (!group) {
      group = {
        subject: g.assessment.subject.name,
        teacher: teacherName.get(g.assessment.teacherId) ?? "\u063A\u064A\u0631 \u0645\u0648\u062B\u0642",
        assessments: []
      };
      gradeGroups.set(key, group);
    }
    group.assessments.push({
      title: g.assessment.title,
      kind: g.assessment.kind,
      date: g.assessment.date.toISOString().slice(0, 10),
      score: g.score,
      max: g.assessment.maxScore
    });
  }
  const autoEvals = [];
  for (const group of gradeGroups.values()) {
    const stats = academicStats(
      group.assessments.map((a) => ({ score: a.score, max: a.max, kind: a.kind }))
    );
    if (!stats) continue;
    autoEvals.push(
      {
        subject: group.subject,
        teacher: group.teacher,
        category: "\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629",
        value: `${stats.pct}%`
      },
      { subject: group.subject, teacher: group.teacher, category: "\u0627\u0644\u062A\u0642\u062F\u064A\u0631", value: stats.letter }
    );
  }
  return {
    student: {
      id: student2.id,
      name: student2.fullName,
      className: student2.enrollments[0]?.class.displayName ?? null
    },
    range: {
      start: rangeStart.toISOString().slice(0, 10),
      end: rangeEnd.toISOString().slice(0, 10)
    },
    attendance: {
      daysRecorded: summaries.length,
      ...byStatus,
      lessonEntries: entries.map((e) => ({
        date: e.lessonSession.date.toISOString().slice(0, 10),
        period: e.lessonSession.period,
        subject: e.lessonSession.subject.name,
        status: e.status,
        statusAr: LESSON_STATUS_AR[e.status]
      }))
    },
    grades: [...gradeGroups.values()],
    evaluations: [
      ...autoEvals,
      ...evaluations.map((e) => ({
        subject: e.subject?.name ?? "\u0639\u0627\u0645",
        teacher: teacherName.get(e.teacherId) ?? "\u063A\u064A\u0631 \u0645\u0648\u062B\u0642",
        category: e.category,
        value: e.value
      }))
    ],
    behavior: behavior.map((b) => ({
      date: b.date.toISOString().slice(0, 10),
      teacher: teacherName.get(b.teacherId) ?? "\u063A\u064A\u0631 \u0645\u0648\u062B\u0642",
      category: b.category,
      text: b.text
    })),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    policyVersion: settings?.policyVersion ?? 1
  };
}
async function createReportSnapshot(actor, input) {
  requireAdmin(actor);
  const content = await buildStudentReport(actor, input);
  return prisma.reportSnapshot.create({
    data: {
      studentId: input.studentId,
      termId: input.termId ?? null,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      contentJson: content,
      status: "approved",
      approvedById: actor.userId,
      approvedAt: /* @__PURE__ */ new Date()
    }
  });
}
async function queueReportDelivery(actor, input) {
  requireAdmin(actor);
  const report = await prisma.reportSnapshot.findUnique({
    where: { id: input.reportSnapshotId }
  });
  if (!report) throw new NotFoundError("\u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  if (report.status !== "approved")
    throw new StateError("\u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u063A\u064A\u0631 \u0645\u0639\u062A\u0645\u062F \u0628\u0639\u062F");
  const guardians = await prisma.guardianStudent.findMany({
    where: { studentId: report.studentId, verified: true },
    include: {
      guardian: {
        include: { user: { select: { telegramChatId: true, isActive: true } } }
      }
    }
  });
  const queued = [];
  for (const g of guardians) {
    const chatId = g.guardian.user.telegramChatId;
    const channel = g.guardian.preferredChannel === "telegram" && !chatId ? "portal" : g.guardian.preferredChannel;
    if (!g.guardian.user.isActive) continue;
    const key = `report:${report.id}:guardian:${g.guardianId}:ch:${channel}`;
    await prisma.outboxEvent.upsert({
      where: { idempotencyKey: key },
      create: {
        type: "report_send",
        channel,
        idempotencyKey: key,
        payload: {
          reportSnapshotId: report.id,
          studentId: report.studentId,
          guardianId: g.guardianId,
          telegramChatId: chatId
        }
      },
      update: {}
      // idempotent — لا إعادة إدراج
    });
    queued.push(g.guardianId);
  }
  await prisma.auditEvent.create({
    data: {
      actorId: actor.userId,
      action: "report.queue",
      entityType: "ReportSnapshot",
      entityId: report.id,
      after: { guardians: queued.length }
    }
  });
  return { queued: queued.length };
}
var init_reports = __esm({
  "../../packages/core/src/services/reports.ts"() {
    "use strict";
    init_src();
    init_permissions();
    init_derive();
    init_service();
    init_grades();
  }
});

// ../../packages/core/src/services/time.ts
async function schoolTimezone() {
  const s2 = await prisma.schoolSettings.findUnique({
    where: { id: "school" },
    select: { timezone: true }
  });
  return s2?.timezone || DEFAULT_TZ;
}
function schoolTodayStr(timezone = DEFAULT_TZ) {
  return (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: timezone });
}
function schoolToday(timezone = DEFAULT_TZ) {
  return /* @__PURE__ */ new Date(`${schoolTodayStr(timezone)}T00:00:00.000Z`);
}
var DEFAULT_TZ;
var init_time = __esm({
  "../../packages/core/src/services/time.ts"() {
    "use strict";
    init_src();
    DEFAULT_TZ = "Asia/Muscat";
  }
});

// ../../packages/core/src/export/weeklyRegister.ts
import ExcelJS from "exceljs";
async function buildWeeklyRegister(opts) {
  const days = opts.days ?? 5;
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(opts.weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const dateStrs = dates.map(toDateStr);
  const end = dates[dates.length - 1];
  const enrollments = await prisma.enrollment.findMany({
    where: {
      academicYearId: opts.academicYearId,
      ...opts.classId ? { classId: opts.classId } : {}
    },
    include: { student: true, class: true },
    orderBy: [{ class: { name: "asc" } }, { student: { fullName: "asc" } }]
  });
  const students = enrollments.map((e) => ({
    id: e.studentId,
    name: e.student.fullName,
    classId: e.classId,
    className: e.class.displayName ?? e.class.name
  }));
  const studentIds = students.map((s2) => s2.id);
  const daily = await prisma.dailySummary.findMany({
    where: { studentId: { in: studentIds }, date: { in: dates } }
  });
  const dailyMap = new Map(daily.map((d) => [`${d.studentId}|${toDateStr(d.date)}`, d.status]));
  const classIds = [...new Set(students.map((s2) => s2.classId))];
  const sessions = await prisma.lessonSession.findMany({
    where: { classId: { in: classIds }, date: { in: dates } },
    include: { entries: { where: { studentId: { in: studentIds } } } }
  });
  const periodMap = /* @__PURE__ */ new Map();
  for (const s2 of sessions)
    for (const e of s2.entries)
      periodMap.set(`${e.studentId}|${toDateStr(s2.date)}|${s2.period}`, e.status);
  const slots = await prisma.timetableSlot.findMany({
    where: { classId: { in: classIds } }
  });
  const teacherNames = new Map(
    (await prisma.user.findMany({
      where: { id: { in: [...new Set(slots.map((s2) => s2.teacherId))] } },
      select: { id: true, name: true }
    })).map((u) => [u.id, u.name])
  );
  const teacherAt = (classId, weekday, period) => slots.filter((s2) => s2.classId === classId && s2.weekday === weekday && s2.period === period).map((s2) => teacherNames.get(s2.teacherId) ?? "").filter(Boolean).join("\u060C ");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("\u0643\u0634\u0641 \u0627\u0644\u062D\u0636\u0648\u0631", { views: [{ rightToLeft: true }] });
  const nFixed = 2;
  const perDay = 1 + PERIODS;
  const nSummary = 5;
  const lastCol = nFixed + days * perDay + nSummary;
  const thin = { style: "thin", color: { argb: "FFB0BDBD" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const center = { horizontal: "center", vertical: "middle", wrapText: true };
  const cell = (r, c, val, o = {}) => {
    const cl = ws.getCell(r, c);
    cl.value = val;
    cl.alignment = center;
    cl.border = border;
    cl.font = {
      name: "Calibri",
      bold: o.bold ?? false,
      size: o.size ?? 11,
      ...o.fontColor ? { color: { argb: `FF${o.fontColor}` } } : {}
    };
    if (o.fill) cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${o.fill}` } };
    return cl;
  };
  ws.mergeCells(1, 1, 1, lastCol);
  cell(
    1,
    1,
    `${opts.schoolName} \u2014 \u0643\u0634\u0641 \u0627\u0644\u062D\u0636\u0648\u0631 \u0648\u0627\u0644\u063A\u064A\u0627\u0628`,
    { bold: true, size: 15, fill: BRAND_DEEP, fontColor: "FFFFFF" }
  );
  ws.mergeCells(2, 1, 2, lastCol);
  const clsLabel = opts.classId ? students[0]?.className ?? "" : "\u0643\u0644 \u0627\u0644\u0635\u0641\u0648\u0641";
  cell(
    2,
    1,
    `\u0627\u0644\u0623\u0633\u0628\u0648\u0639: ${dateStrs[0]} \u0625\u0644\u0649 ${toDateStr(end)} \u2014 ${clsLabel}`,
    { bold: true, size: 11, fill: BRAND_SOFT, fontColor: "134E4A" }
  );
  const dateRow = 4, dowRow = 5, headRow = 6;
  for (let i = 0; i < days; i++) {
    const c0 = nFixed + i * perDay + 1;
    ws.mergeCells(dateRow, c0, dateRow, c0 + perDay - 1);
    cell(dateRow, c0, dateStrs[i], { bold: true, fill: DAY_HEAD[i % 7] });
    ws.mergeCells(dowRow, c0, dowRow, c0 + perDay - 1);
    cell(dowRow, c0, DAY_NAMES[dates[i].getUTCDay()], { bold: true, fill: DAY_HEAD[i % 7] });
    cell(headRow, c0, "\u0627\u0644\u062D\u0627\u0644\u0629", { bold: true, fill: DAY_HEAD[i % 7], size: 10 });
    for (let p = 1; p <= PERIODS; p++)
      cell(headRow, c0 + p, p, { bold: true, fill: DAY_TINT[i % 7], size: 10 });
  }
  cell(headRow, 1, "#", { bold: true, fill: BRAND_SOFT });
  cell(headRow, 2, "\u0627\u0633\u0645 \u0627\u0644\u0637\u0627\u0644\u0628", { bold: true, fill: BRAND_SOFT });
  ["\u062D\u0627\u0636\u0631 (\u062D\u0635\u0635)", "\u063A\u0627\u0626\u0628 (\u062D\u0635\u0635)", "\u0645\u062A\u0623\u062E\u0631 (\u062D\u0635\u0635)", "\u0628\u0639\u0630\u0631 (\u062D\u0635\u0635)", "\u0623\u064A\u0627\u0645 \u063A\u064A\u0627\u0628"].forEach((l, i) => cell(headRow, nFixed + days * perDay + 1 + i, l, { bold: true, fill: ACCENT_HEAD, size: 10 }));
  const classesInFile = [...new Map(students.map((s2) => [s2.classId, s2.className])).entries()];
  const multi = classesInFile.length > 1;
  let row = headRow;
  for (const [classId, className] of classesInFile) {
    const clsStudents = students.filter((s2) => s2.classId === classId);
    if (multi) {
      row++;
      ws.mergeCells(row, 1, row, lastCol);
      cell(row, 1, `\u25C6 ${className}`, { bold: true, fill: BRAND_DEEP, size: 12, fontColor: "FFFFFF" });
    }
    clsStudents.forEach((s2, idx) => {
      row++;
      cell(row, 1, idx + 1);
      cell(row, 2, s2.name).alignment = { horizontal: "right", vertical: "middle" };
      const totals = { present: 0, absent: 0, late: 0, excused: 0 };
      let absentDays = 0;
      for (let i = 0; i < days; i++) {
        const c0 = nFixed + i * perDay + 1;
        const ds = dateStrs[i];
        const dayStatus = dailyMap.get(`${s2.id}|${ds}`);
        const label = dayStatus ? DAY_LABEL[dayStatus] ?? "" : "";
        const stStyle = dayStatus ? DAY_STATUS_STYLE[dayStatus] : void 0;
        cell(row, c0, label, {
          fill: stStyle?.fill ?? DAY_TINT[i % 7],
          bold: !!dayStatus,
          ...stStyle ? { fontColor: stStyle.font } : {}
        });
        if (dayStatus === "absent" || dayStatus === "excused") absentDays++;
        for (let p = 1; p <= PERIODS; p++) {
          const st = periodMap.get(`${s2.id}|${ds}|${p}`);
          if (st && st in totals) totals[st]++;
          cell(row, c0 + p, st ? PERIOD_MARK[st] ?? "" : "", {
            fill: DAY_TINT[i % 7],
            size: 9,
            ...st && PERIOD_FONT[st] ? { fontColor: PERIOD_FONT[st], bold: true } : {}
          });
        }
      }
      const base = nFixed + days * perDay + 1;
      cell(row, base, totals.present || "");
      cell(row, base + 1, totals.absent || "");
      cell(row, base + 2, totals.late || "");
      cell(row, base + 3, totals.excused || "");
      cell(row, base + 4, absentDays || "");
    });
    row++;
    cell(row, 1, "", { fill: BRAND_SOFT });
    cell(row, 2, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0639\u0644\u0645", { bold: true, fill: BRAND_SOFT, size: 10 });
    for (let i = 0; i < days; i++) {
      const c0 = nFixed + i * perDay + 1;
      cell(row, c0, "", { fill: DAY_HEAD[i % 7] });
      for (let p = 1; p <= PERIODS; p++)
        cell(
          row,
          c0 + p,
          teacherAt(classId, dates[i].getUTCDay(), p),
          { fill: DAY_TINT[i % 7], size: 8 }
        );
    }
    const dayStatusOf = (sid, ds) => dailyMap.get(`${sid}|${ds}`);
    const dayKeyFor = (st) => st === "excused" ? "excused" : st;
    for (const [label, stKey] of [
      ["\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u062D\u0636\u0648\u0631", "present"],
      ["\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u063A\u064A\u0627\u0628", "absent"],
      ["\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0627\u0633\u062A\u0626\u0630\u0627\u0646", "excused"],
      ["\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u062A\u0623\u062E\u064A\u0631", "late"]
    ]) {
      row++;
      cell(row, 1, "", { fill: BRAND_SOFT });
      cell(row, 2, label, { bold: true, fill: BRAND_SOFT, size: 10 });
      for (let i = 0; i < days; i++) {
        const c0 = nFixed + i * perDay + 1;
        const ds = dateStrs[i];
        cell(
          row,
          c0,
          clsStudents.filter((s2) => dayStatusOf(s2.id, ds) === stKey).length || "",
          { fill: DAY_TINT[i % 7], size: 10 }
        );
        for (let p = 1; p <= PERIODS; p++)
          cell(
            row,
            c0 + p,
            clsStudents.filter((s2) => periodMap.get(`${s2.id}|${ds}|${p}`) === stKey).length || "",
            { fill: DAY_TINT[i % 7], size: 10 }
          );
      }
      for (let c = nFixed + days * perDay + 1; c <= lastCol; c++)
        cell(row, c, "", { fill: BRAND_SOFT });
    }
    row += 2;
    for (const label of ["\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u062D\u0636\u0648\u0631", "\u0646\u0633\u0628\u0629 \u0627\u0644\u062D\u0636\u0648\u0631", "\u0627\u0644\u063A\u064A\u0627\u0628 \u0628\u0639\u0630\u0631", "\u0627\u0644\u063A\u064A\u0627\u0628 \u0628\u062F\u0648\u0646 \u0639\u0630\u0631"]) {
      cell(row, 1, "", { fill: ACCENT_SOFT });
      cell(row, 2, label, { bold: true, fill: ACCENT_SOFT, size: 10 });
      for (let i = 0; i < days; i++) {
        const c0 = nFixed + i * perDay + 1;
        const ds = dateStrs[i];
        ws.mergeCells(row, c0, row, c0 + perDay - 1);
        let v = "";
        if (label === "\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u062D\u0636\u0648\u0631") {
          const marked = Array.from({ length: PERIODS }, (_, k) => k + 1).filter((p) => clsStudents.some((s2) => periodMap.get(`${s2.id}|${ds}|${p}`))).map((p) => clsStudents.filter((s2) => periodMap.get(`${s2.id}|${ds}|${p}`) === "present").length);
          if (marked.length) v = (marked.reduce((a, b) => a + b, 0) / marked.length).toFixed(1);
        } else if (label === "\u0646\u0633\u0628\u0629 \u0627\u0644\u062D\u0636\u0648\u0631") {
          let rec = 0, pres = 0;
          for (const s2 of clsStudents) for (let p = 1; p <= PERIODS; p++) {
            const st = periodMap.get(`${s2.id}|${ds}|${p}`);
            if (st) {
              rec++;
              if (st === "present") pres++;
            }
          }
          if (rec) v = `${Math.round(100 * pres / rec)}%`;
        } else {
          const want = label === "\u0627\u0644\u063A\u064A\u0627\u0628 \u0628\u0639\u0630\u0631" ? "excused" : "absent";
          v = clsStudents.filter((s2) => dayStatusOf(s2.id, ds) === want).length || "";
        }
        cell(row, c0, v, { bold: true, fill: DAY_HEAD[i % 7], size: 10 });
      }
      row++;
    }
    row--;
  }
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 30;
  for (let c = nFixed + 1; c <= nFixed + days * perDay; c++)
    ws.getColumn(c).width = (c - nFixed - 1) % perDay === 0 ? 11 : 8;
  for (let c = nFixed + days * perDay + 1; c <= lastCol; c++)
    ws.getColumn(c).width = 11;
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: headRow, xSplit: 2 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
var PERIODS, DAY_TINT, DAY_HEAD, DAY_NAMES, BRAND_DEEP, BRAND_SOFT, ACCENT_SOFT, ACCENT_HEAD, PERIOD_MARK, PERIOD_FONT, DAY_LABEL, DAY_STATUS_STYLE, toDateStr;
var init_weeklyRegister = __esm({
  "../../packages/core/src/export/weeklyRegister.ts"() {
    "use strict";
    init_src();
    PERIODS = 8;
    DAY_TINT = ["F0FDFA", "FFFBEB", "F0FDFA", "FFFBEB", "F0FDFA", "FFFBEB", "F0FDFA"];
    DAY_HEAD = ["5EEAD4", "FCD34D", "5EEAD4", "FCD34D", "5EEAD4", "FCD34D", "5EEAD4"];
    DAY_NAMES = ["\u0627\u0644\u0623\u062D\u062F", "\u0627\u0644\u0627\u062B\u0646\u064A\u0646", "\u0627\u0644\u062B\u0644\u0627\u062B\u0627\u0621", "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621", "\u0627\u0644\u062E\u0645\u064A\u0633", "\u0627\u0644\u062C\u0645\u0639\u0629", "\u0627\u0644\u0633\u0628\u062A"];
    BRAND_DEEP = "0F766E";
    BRAND_SOFT = "CCFBF1";
    ACCENT_SOFT = "FEF3C7";
    ACCENT_HEAD = "FDE68A";
    PERIOD_MARK = {
      present: "\u062D\u0627\u0636\u0631",
      absent: "\u063A\u064A\u0627\u0628",
      late: "\u062A\u0623\u062E\u064A\u0631",
      excused: "\u0627\u0633\u062A\u0626\u0630\u0627\u0646"
    };
    PERIOD_FONT = {
      absent: "B91C1C",
      late: "6D28D9",
      excused: "B45309"
    };
    DAY_LABEL = {
      present: "\u062D\u0627\u0636\u0631",
      absent: "\u063A\u0627\u0626\u0628",
      excused: "\u063A\u0627\u0626\u0628 \u0628\u0639\u0630\u0631",
      partial: "\u063A\u064A\u0627\u0628 \u062C\u0632\u0626\u064A",
      late: "\u0645\u062A\u0623\u062E\u0631"
    };
    DAY_STATUS_STYLE = {
      present: { fill: "D1FAE5", font: "047857" },
      absent: { fill: "FEE2E2", font: "B91C1C" },
      excused: { fill: "FEF3C7", font: "B45309" },
      partial: { fill: "FFEDD5", font: "C2410C" },
      late: { fill: "EDE9FE", font: "6D28D9" }
    };
    toDateStr = (d) => d.toISOString().slice(0, 10);
  }
});

// ../../packages/core/src/services/weeklyDigest.ts
async function calendarConfigured() {
  const [terms, days] = await Promise.all([
    prisma.term.count(),
    prisma.calendarDay.count()
  ]);
  return terms > 0 || days > 0;
}
async function generateWeeklyDigests(input) {
  const requireCalendar = input?.requireCalendar ?? true;
  if (requireCalendar && !await calendarConfigured()) {
    return {
      rangeStart: "",
      rangeEnd: "",
      students: 0,
      guardians: 0,
      queued: 0,
      skippedNoCalendar: true
    };
  }
  const rangeEnd = schoolToday(await schoolTimezone());
  const rangeStart = new Date(rangeEnd);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (input?.rangeDays ?? 7));
  const rs = rangeStart.toISOString().slice(0, 10);
  const re = rangeEnd.toISOString().slice(0, 10);
  const links = await prisma.guardianStudent.findMany({
    where: { verified: true, student: { isActive: true } },
    include: {
      student: { select: { id: true } },
      guardian: {
        include: { user: { select: { telegramChatId: true, isActive: true } } }
      }
    }
  });
  if (!links.length)
    return { rangeStart: rs, rangeEnd: re, students: 0, guardians: 0, queued: 0, skippedNoCalendar: false };
  const studentIds = [...new Set(links.map((l) => l.student.id))];
  const snapshotByStudent = /* @__PURE__ */ new Map();
  for (const studentId of studentIds) {
    const existing = await prisma.reportSnapshot.findFirst({
      where: {
        studentId,
        rangeStart,
        rangeEnd,
        status: { in: ["approved", "sent"] }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) {
      snapshotByStudent.set(studentId, existing.id);
      continue;
    }
    const content = await buildStudentReport(SYSTEM_ACTOR, {
      studentId,
      rangeStart,
      rangeEnd
    });
    const snap = await prisma.reportSnapshot.create({
      data: {
        studentId,
        rangeStart,
        rangeEnd,
        contentJson: content,
        status: "approved",
        approvedById: SYSTEM_ACTOR.userId,
        approvedAt: /* @__PURE__ */ new Date()
      }
    });
    snapshotByStudent.set(studentId, snap.id);
  }
  const byGuardian = /* @__PURE__ */ new Map();
  for (const l of links) {
    const snapId = snapshotByStudent.get(l.student.id);
    if (!snapId) continue;
    const g = byGuardian.get(l.guardianId) ?? {
      chatId: l.guardian.user.telegramChatId,
      isActive: l.guardian.user.isActive,
      snapshotIds: /* @__PURE__ */ new Set()
    };
    g.snapshotIds.add(snapId);
    byGuardian.set(l.guardianId, g);
  }
  let queued = 0;
  for (const [guardianId, g] of byGuardian) {
    if (!g.isActive) continue;
    const channel = g.chatId ? "telegram" : "portal";
    const key = `weekly:${rs}:${re}:g:${guardianId}`;
    await prisma.outboxEvent.upsert({
      where: { idempotencyKey: key },
      create: {
        type: "weekly_digest",
        channel,
        idempotencyKey: key,
        payload: {
          guardianId,
          telegramChatId: g.chatId,
          reportSnapshotIds: [...g.snapshotIds],
          rangeStart: rs,
          rangeEnd: re
        }
      },
      update: {}
    });
    queued++;
  }
  return {
    rangeStart: rs,
    rangeEnd: re,
    students: snapshotByStudent.size,
    guardians: byGuardian.size,
    queued,
    skippedNoCalendar: false
  };
}
var SYSTEM_ACTOR;
var init_weeklyDigest = __esm({
  "../../packages/core/src/services/weeklyDigest.ts"() {
    "use strict";
    init_src();
    init_reports();
    init_time();
    SYSTEM_ACTOR = { userId: "system", role: "admin", isActive: true };
  }
});

// ../../packages/core/src/services/weeklyPlan.ts
async function schoolWeekDays() {
  const s2 = await prisma.schoolSettings.findUnique({
    where: { id: "school" },
    select: { weekDays: true }
  });
  return (s2?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort((a, b) => a - b).map((w) => ({ weekday: w, name: WEEKDAY_AR[w] ?? `\u064A\u0648\u0645 ${w}` }));
}
async function savePlan(actor, input) {
  requireTeacher(actor);
  const teacherId = actor.role === "admin" && input.teacherId ? input.teacherId : actor.userId;
  const year2 = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year2) throw new NotFoundError("\u0644\u0627 \u0639\u0627\u0645 \u062F\u0631\u0627\u0633\u064A\u0627\u064B \u062D\u0627\u0644\u064A\u0627\u064B");
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      teacherId,
      classId: input.classId,
      subjectId: input.subjectId,
      academicYearId: year2.id,
      isActive: true
    }
  });
  if (!assignment)
    throw new ForbiddenError("\u0647\u0630\u0627 \u0627\u0644\u0635\u0641/\u0627\u0644\u0645\u0627\u062F\u0629 \u063A\u064A\u0631 \u0645\u0633\u0646\u062F \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u0644\u0645");
  const weekStart2 = weekStartOf(input.weekStart);
  const plan2 = await prisma.weeklyPlan.upsert({
    where: {
      teacherId_classId_subjectId_weekStart: {
        teacherId,
        classId: input.classId,
        subjectId: input.subjectId,
        weekStart: weekStart2
      }
    },
    create: {
      teacherId,
      classId: input.classId,
      subjectId: input.subjectId,
      weekStart: weekStart2
    },
    update: {}
  });
  await prisma.weeklyPlanEntry.deleteMany({ where: { planId: plan2.id } });
  const rows = input.entries.filter(
    (e) => e.lessonTitle?.trim() || e.textbook?.trim() || e.platforms?.trim() || e.tests?.trim() || e.notes?.trim()
  );
  if (rows.length) {
    await prisma.weeklyPlanEntry.createMany({
      data: rows.map((e) => ({
        planId: plan2.id,
        weekday: e.weekday,
        lessonTitle: e.lessonTitle?.trim() || null,
        textbook: e.textbook?.trim() || null,
        platforms: e.platforms?.trim() || null,
        tests: e.tests?.trim() || null,
        notes: e.notes?.trim() || null
      }))
    });
  }
  return { planId: plan2.id };
}
async function submitPlan(actor, planId) {
  requireTeacher(actor);
  const plan2 = await prisma.weeklyPlan.findUnique({ where: { id: planId } });
  if (!plan2) throw new NotFoundError("\u0627\u0644\u062E\u0637\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (actor.role !== "admin" && plan2.teacherId !== actor.userId)
    throw new ForbiddenError();
  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: { status: "submitted", submittedAt: /* @__PURE__ */ new Date() }
  });
}
async function unsubmitPlan(actor, planId) {
  requireTeacher(actor);
  const plan2 = await prisma.weeklyPlan.findUnique({ where: { id: planId } });
  if (!plan2) throw new NotFoundError("\u0627\u0644\u062E\u0637\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (actor.role !== "admin" && plan2.teacherId !== actor.userId)
    throw new ForbiddenError();
  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: { status: "draft", submittedAt: null }
  });
}
async function classPlanMatrix(classId, weekStart2) {
  const year2 = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const assignments = await prisma.teachingAssignment.findMany({
    where: { classId, academicYearId: year2?.id, isActive: true },
    include: { subject: { select: { id: true, name: true } } },
    orderBy: { subject: { name: "asc" } }
  });
  const teachers = await prisma.user.findMany({
    where: { id: { in: [...new Set(assignments.map((a) => a.teacherId))] } },
    select: { id: true, name: true, isActive: true }
  });
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const plans = await prisma.weeklyPlan.findMany({
    where: { classId, weekStart: weekStartOf(weekStart2) },
    select: { id: true, teacherId: true, subjectId: true, status: true }
  });
  const key = (t, s2) => `${t}|${s2}`;
  const byKey = new Map(plans.map((p) => [key(p.teacherId, p.subjectId), p]));
  return assignments.filter((a) => teacherById.get(a.teacherId)?.isActive).map((a) => {
    const p = byKey.get(key(a.teacherId, a.subjectId));
    return {
      assignmentId: a.id,
      teacherId: a.teacherId,
      teacherName: teacherById.get(a.teacherId)?.name ?? "\u2014",
      subjectId: a.subject.id,
      subjectName: a.subject.name,
      planId: p?.id ?? null,
      status: p ? p.status : "missing"
    };
  });
}
async function publishClassPlan(actor, input) {
  requireAdmin(actor);
  const weekStart2 = weekStartOf(input.weekStart);
  const year2 = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const assignments = await prisma.teachingAssignment.findMany({
    where: { classId: input.classId, academicYearId: year2?.id, isActive: true },
    include: { subject: { select: { id: true, name: true } } },
    orderBy: { subject: { name: "asc" } }
  });
  const teachers = await prisma.user.findMany({
    where: { id: { in: [...new Set(assignments.map((a) => a.teacherId))] } },
    select: { id: true, name: true, isActive: true }
  });
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const plans = await prisma.weeklyPlan.findMany({
    where: { classId: input.classId, weekStart: weekStart2 },
    include: { entries: { orderBy: { weekday: "asc" } } }
  });
  const byKey = new Map(plans.map((p) => [`${p.teacherId}|${p.subjectId}`, p]));
  const subjects = assignments.filter((a) => teacherById.get(a.teacherId)?.isActive).map((a) => {
    const p = byKey.get(`${a.teacherId}|${a.subject.id}`);
    const submitted = p?.status === "submitted";
    return {
      subjectId: a.subject.id,
      subjectName: a.subject.name,
      teacherName: teacherById.get(a.teacherId)?.name ?? "\u2014",
      missing: !submitted,
      entries: submitted ? p.entries.map((e) => ({
        weekday: e.weekday,
        lessonTitle: e.lessonTitle,
        textbook: e.textbook,
        platforms: e.platforms,
        tests: e.tests,
        notes: e.notes
      })) : []
    };
  });
  if (!subjects.some((s2) => !s2.missing))
    throw new NotFoundError("\u0644\u0627 \u062E\u0637\u0637 \u0645\u0633\u0644\u0651\u0645\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0635\u0641 \u0648\u0627\u0644\u0623\u0633\u0628\u0648\u0639");
  const publication = await prisma.classWeeklyPlanPublication.create({
    data: {
      classId: input.classId,
      weekStart: weekStart2,
      contentJson: subjects,
      publishedById: actor.userId
    }
  });
  const links = await prisma.guardianStudent.findMany({
    where: {
      verified: true,
      student: {
        isActive: true,
        enrollments: {
          some: { classId: input.classId, academicYearId: year2?.id }
        }
      }
    },
    include: {
      guardian: { include: { user: { select: { telegramChatId: true, isActive: true } } } }
    }
  });
  const seen = /* @__PURE__ */ new Set();
  let guardians = 0;
  for (const l of links) {
    if (!l.guardian.user.isActive || seen.has(l.guardianId)) continue;
    seen.add(l.guardianId);
    const channel = l.guardian.user.telegramChatId ? "telegram" : "portal";
    await prisma.outboxEvent.upsert({
      where: { idempotencyKey: `plan:${publication.id}:g:${l.guardianId}` },
      create: {
        type: "plan_notify",
        channel,
        idempotencyKey: `plan:${publication.id}:g:${l.guardianId}`,
        payload: {
          publicationId: publication.id,
          guardianId: l.guardianId,
          telegramChatId: l.guardian.user.telegramChatId
        }
      },
      update: {}
    });
    guardians++;
  }
  return { publicationId: publication.id, subjects: subjects.length, guardians };
}
async function publicationsForGuardian(actor) {
  const profile2 = await prisma.guardianProfile.findUnique({
    where: { userId: actor.userId },
    include: {
      children: {
        where: { verified: true },
        include: {
          student: {
            include: {
              enrollments: {
                include: { class: { select: { id: true, displayName: true, name: true } } }
              }
            }
          }
        }
      }
    }
  });
  if (!profile2) return [];
  const classIds = /* @__PURE__ */ new Map();
  for (const c of profile2.children)
    for (const e of c.student.enrollments)
      classIds.set(e.class.id, e.class.displayName ?? e.class.name);
  const pubs = await prisma.classWeeklyPlanPublication.findMany({
    where: { classId: { in: [...classIds.keys()] } },
    orderBy: { publishedAt: "desc" },
    take: 12
  });
  return pubs.map((p) => ({
    id: p.id,
    weekStart: p.weekStart,
    className: classIds.get(p.classId) ?? "\u0627\u0644\u0635\u0641",
    subjects: p.contentJson.length,
    publishedAt: p.publishedAt
  }));
}
var WEEKDAY_AR;
var init_weeklyPlan = __esm({
  "../../packages/core/src/services/weeklyPlan.ts"() {
    "use strict";
    init_src();
    init_permissions();
    init_grades();
    WEEKDAY_AR = {
      0: "\u0627\u0644\u0623\u062D\u062F",
      1: "\u0627\u0644\u0627\u062B\u0646\u064A\u0646",
      2: "\u0627\u0644\u062B\u0644\u0627\u062B\u0627\u0621",
      3: "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621",
      4: "\u0627\u0644\u062E\u0645\u064A\u0633",
      5: "\u0627\u0644\u062C\u0645\u0639\u0629",
      6: "\u0627\u0644\u0633\u0628\u062A"
    };
  }
});

// ../../packages/core/src/index.ts
var src_exports2 = {};
__export(src_exports2, {
  AUTO_EVAL_CATEGORIES: () => AUTO_EVAL_CATEGORIES,
  BEHAVIOR_AR: () => BEHAVIOR_AR,
  ConflictError: () => ConflictError,
  DAY_STATUS_AR: () => DAY_STATUS_AR,
  DEFAULT_POLICY: () => DEFAULT_POLICY,
  ForbiddenError: () => ForbiddenError,
  LESSON_STATUS_AR: () => LESSON_STATUS_AR,
  NotFoundError: () => NotFoundError,
  StateError: () => StateError,
  WEEKLY_EVAL_CATEGORIES: () => WEEKLY_EVAL_CATEGORIES,
  WEEKLY_EVAL_OPTIONS: () => WEEKLY_EVAL_OPTIONS,
  academicStats: () => academicStats,
  addNote: () => addNote,
  assessmentsForTeacher: () => assessmentsForTeacher,
  buildStudentReport: () => buildStudentReport,
  buildWeeklyRegister: () => buildWeeklyRegister,
  calendarConfigured: () => calendarConfigured,
  classPlanMatrix: () => classPlanMatrix,
  clearAttendance: () => clearAttendance,
  createAssessment: () => createAssessment,
  createReportSnapshot: () => createReportSnapshot,
  defaultEvalValue: () => defaultEvalValue,
  deriveDayStatus: () => deriveDayStatus,
  ensureSession: () => ensureSession,
  generateWeeklyDigests: () => generateWeeklyDigests,
  lessonsForTeacher: () => lessonsForTeacher,
  letterFromPct: () => letterFromPct,
  markAllPresent: () => markAllPresent,
  publicationsForGuardian: () => publicationsForGuardian,
  publishClassPlan: () => publishClassPlan,
  queueReportDelivery: () => queueReportDelivery,
  recomputeDaily: () => recomputeDaily,
  recordAttendance: () => recordAttendance,
  recordBehavior: () => recordBehavior,
  requireActive: () => requireActive,
  requireAdmin: () => requireAdmin,
  requireGuardian: () => requireGuardian,
  requireTeacher: () => requireTeacher,
  savePlan: () => savePlan,
  schoolTimezone: () => schoolTimezone,
  schoolToday: () => schoolToday,
  schoolTodayStr: () => schoolTodayStr,
  schoolWeekDays: () => schoolWeekDays,
  sessionRoster: () => sessionRoster,
  setEvaluation: () => setEvaluation,
  setGrade: () => setGrade,
  submitPlan: () => submitPlan,
  submitSession: () => submitSession,
  unsubmitPlan: () => unsubmitPlan,
  weekStartOf: () => weekStartOf
});
var init_src2 = __esm({
  "../../packages/core/src/index.ts"() {
    "use strict";
    init_attendance();
    init_service();
    init_permissions();
    init_behavior();
    init_grades();
    init_reports();
    init_time();
    init_weeklyRegister();
    init_weeklyDigest();
    init_weeklyPlan();
  }
});

// src/lib/telegram.ts
import { Bot } from "grammy";
function botApi() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637");
  return new Bot(token).api;
}
function splitMessage(text, limit = TELEGRAM_LIMIT) {
  if (text.length <= limit) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) parts.push(rest);
  return parts;
}
function portalUrl() {
  const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/parent` : "";
}
function renderReportText(c, schoolName) {
  const lines = [
    `\u{1F4CB} ${schoolName}`,
    `\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0637\u0627\u0644\u0628: ${c.student.name}${c.student.className ? ` \u2014 ${c.student.className}` : ""}`,
    `\u0627\u0644\u0641\u062A\u0631\u0629: ${c.range.start} \u2192 ${c.range.end}`,
    "",
    "\u2014 \u0627\u0644\u062D\u0636\u0648\u0631 \u2014",
    `\u0623\u064A\u0627\u0645 \u0645\u0631\u0635\u0648\u062F\u0629: ${c.attendance.daysRecorded} \xB7 \u062D\u0636\u0648\u0631 ${c.attendance.present} \xB7 \u063A\u064A\u0627\u0628 ${c.attendance.absent} \xB7 \u063A\u064A\u0627\u0628 \u062C\u0632\u0626\u064A ${c.attendance.partial} \xB7 \u0627\u0633\u062A\u0626\u0630\u0627\u0646 ${c.attendance.excused} \xB7 \u062A\u0623\u062E\u064A\u0631 ${c.attendance.late}`
  ];
  if (c.attendance.lessonEntries.length) {
    lines.push("", "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062D\u0635\u0635:");
    for (const e of c.attendance.lessonEntries)
      lines.push(`\u2022 ${e.date} \u062D\u0635\u0629 ${e.period} (${e.subject}): ${e.statusAr}`);
  }
  if (c.grades.length) {
    lines.push("", "\u2014 \u0627\u0644\u062F\u0631\u062C\u0627\u062A \u2014");
    for (const g of c.grades) {
      lines.push(`${g.subject} (${g.teacher}):`);
      for (const a of g.assessments)
        lines.push(`  \u2022 ${a.title} ${a.date}: ${a.score ?? "\u2014"}/${a.max}`);
    }
  }
  if (c.evaluations.length) {
    lines.push("", "\u2014 \u0627\u0644\u062A\u0642\u064A\u064A\u0645\u0627\u062A \u2014");
    for (const e of c.evaluations)
      lines.push(`\u2022 ${e.subject} (${e.teacher}) ${e.category}: ${e.value}`);
  }
  const famBehavior = c.behavior.filter((b) => b.category || b.text);
  if (famBehavior.length) {
    lines.push("", "\u2014 \u0627\u0644\u0633\u0644\u0648\u0643 \u2014");
    for (const b of famBehavior)
      lines.push(`\u2022 ${b.date}: ${b.category ?? ""} ${b.text ?? ""}`.trim());
  }
  const portal = portalUrl();
  lines.push("", portal ? `\u0644\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0643\u0627\u0645\u0644\u0629 \u2014 \u0628\u0648\u0627\u0628\u0629 \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631:
${portal}` : "\u0644\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0643\u0627\u0645\u0644\u0629: \u0628\u0648\u0627\u0628\u0629 \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631.");
  return lines.join("\n");
}
var TELEGRAM_LIMIT;
var init_telegram = __esm({
  "src/lib/telegram.ts"() {
    "use strict";
    TELEGRAM_LIMIT = 4096;
  }
});

// src/lib/jobs/reportSend.ts
async function sendReportJob(outboxEventId) {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: outboxEventId }
  });
  if (!event || event.status === "done" || event.status === "cancelled") return;
  const payload = event.payload;
  const report = await prisma.reportSnapshot.findUnique({
    where: { id: payload.reportSnapshotId }
  });
  if (!report) throw new Error("\u0644\u0642\u0637\u0629 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  const settings = await prisma.schoolSettings.findUnique({
    where: { id: "school" }
  });
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", attempts: { increment: 1 } }
  });
  try {
    let providerMsgId = null;
    if (event.channel === "telegram") {
      if (!payload.telegramChatId)
        throw new Error("\u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637 \u0628\u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645");
      const api = botApi();
      const text = renderReportText(
        report.contentJson,
        settings?.schoolName ?? "\u0627\u0644\u0645\u062F\u0631\u0633\u0629"
      );
      for (const part of splitMessage(text)) {
        const msg = await api.sendMessage(payload.telegramChatId, part);
        providerMsgId = String(msg.message_id);
      }
    } else {
      providerMsgId = "portal";
    }
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: "success",
          providerMsgId
        }
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "done", lastError: null }
      }),
      prisma.reportSnapshot.update({
        where: { id: report.id },
        data: { status: "sent" }
      })
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const ambiguous = /timeout|ETIMEDOUT|ECONNRESET/i.test(message);
    const maxed = event.attempts + 1 >= 8;
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: ambiguous ? "ambiguous" : "failed",
          error: message.slice(0, 500)
        }
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: ambiguous || maxed ? "failed" : "pending",
          lastError: message.slice(0, 500),
          nextAttemptAt: ambiguous ? /* @__PURE__ */ new Date() : new Date(Date.now() + Math.min(36e5, 6e4 * 2 ** event.attempts))
        }
      })
    ]);
    throw err;
  }
}
var init_reportSend = __esm({
  "src/lib/jobs/reportSend.ts"() {
    "use strict";
    init_src();
    init_telegram();
  }
});

// src/lib/jobs/alertSend.ts
async function sendAlertJob(outboxEventId) {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: outboxEventId }
  });
  if (!event || event.status === "done" || event.status === "cancelled") return;
  const payload = event.payload;
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", attempts: { increment: 1 } }
  });
  try {
    let providerMsgId = null;
    if (event.channel === "telegram") {
      if (!payload.telegramChatId)
        throw new Error("\u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637 \u0628\u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645");
      const settings = await prisma.schoolSettings.findUnique({
        where: { id: "school" }
      });
      const statusText = payload.status === "excused" ? "\u063A\u064A\u0627\u0628\u0627\u064B \u0628\u0639\u0630\u0631" : "\u063A\u064A\u0627\u0628\u0627\u064B";
      const text = `${settings?.schoolName ?? "\u0627\u0644\u0645\u062F\u0631\u0633\u0629"} \u2014 \u062A\u0646\u0628\u064A\u0647 \u063A\u064A\u0627\u0628
\u0646\u0648\u062F \u0625\u0639\u0644\u0627\u0645\u0643\u0645 \u0628\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0637\u0627\u0644\u0628/\u0629 \xAB${payload.studentName}\xBB ${statusText} \u064A\u0648\u0645 ${payload.date}.
\u0644\u0644\u0627\u0633\u062A\u0641\u0633\u0627\u0631 \u0623\u0648 \u062A\u0642\u062F\u064A\u0645 \u0639\u0630\u0631 \u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629.` + (portalUrl() ? `

\u0628\u0648\u0627\u0628\u0629 \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631:
${portalUrl()}` : "");
      const msg = await botApi().sendMessage(payload.telegramChatId, text);
      providerMsgId = String(msg.message_id);
    } else {
      providerMsgId = "portal";
    }
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: "success",
          providerMsgId
        }
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "done", lastError: null }
      })
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const ambiguous = /timeout|ETIMEDOUT|ECONNRESET/i.test(message);
    const maxed = event.attempts + 1 >= 8;
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: ambiguous ? "ambiguous" : "failed",
          error: message.slice(0, 500)
        }
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: ambiguous || maxed ? "failed" : "pending",
          lastError: message.slice(0, 500),
          nextAttemptAt: ambiguous ? /* @__PURE__ */ new Date() : new Date(Date.now() + Math.min(36e5, 6e4 * 2 ** event.attempts))
        }
      })
    ]);
    throw err;
  }
}
var init_alertSend = __esm({
  "src/lib/jobs/alertSend.ts"() {
    "use strict";
    init_src();
    init_telegram();
  }
});

// src/lib/jobs/digestSend.ts
async function sendDigestJob(outboxEventId) {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: outboxEventId }
  });
  if (!event || event.status === "done" || event.status === "cancelled") return;
  const payload = event.payload;
  const reports = await prisma.reportSnapshot.findMany({
    where: { id: { in: payload.reportSnapshotIds } }
  });
  if (!reports.length) throw new Error("\u0644\u0627 \u0644\u0642\u0637\u0627\u062A \u0644\u0647\u0630\u0627 \u0627\u0644\u062A\u0644\u062E\u064A\u0635");
  const settings = await prisma.schoolSettings.findUnique({
    where: { id: "school" }
  });
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", attempts: { increment: 1 } }
  });
  try {
    let providerMsgId = null;
    if (event.channel === "telegram") {
      if (!payload.telegramChatId)
        throw new Error("\u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637 \u0628\u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645");
      const parts = reports.map(
        (r) => renderReportText(
          r.contentJson,
          settings?.schoolName ?? "\u0627\u0644\u0645\u062F\u0631\u0633\u0629"
        )
      );
      const text = parts.join("\n\n\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\n\n");
      const api = botApi();
      for (const part of splitMessage(text)) {
        const msg = await api.sendMessage(payload.telegramChatId, part);
        providerMsgId = String(msg.message_id);
      }
    } else {
      providerMsgId = "portal";
    }
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: "success",
          providerMsgId
        }
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "done", lastError: null }
      }),
      prisma.reportSnapshot.updateMany({
        where: { id: { in: reports.map((r) => r.id) } },
        data: { status: "sent" }
      })
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const ambiguous = /timeout|ETIMEDOUT|ECONNRESET/i.test(message);
    const maxed = event.attempts + 1 >= 8;
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: ambiguous ? "ambiguous" : "failed",
          error: message.slice(0, 500)
        }
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: ambiguous || maxed ? "failed" : "pending",
          lastError: message.slice(0, 500),
          nextAttemptAt: ambiguous ? /* @__PURE__ */ new Date() : new Date(Date.now() + Math.min(36e5, 6e4 * 2 ** event.attempts))
        }
      })
    ]);
    throw err;
  }
}
var init_digestSend = __esm({
  "src/lib/jobs/digestSend.ts"() {
    "use strict";
    init_src();
    init_telegram();
  }
});

// ../../node_modules/react/cjs/react-jsx-runtime.production.js
var require_react_jsx_runtime_production = __commonJS({
  "../../node_modules/react/cjs/react-jsx-runtime.production.js"(exports) {
    "use strict";
    var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
    var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
    function jsxProd(type, config, maybeKey) {
      var key = null;
      void 0 !== maybeKey && (key = "" + maybeKey);
      void 0 !== config.key && (key = "" + config.key);
      if ("key" in config) {
        maybeKey = {};
        for (var propName in config)
          "key" !== propName && (maybeKey[propName] = config[propName]);
      } else maybeKey = config;
      config = maybeKey.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== config ? config : null,
        props: maybeKey
      };
    }
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.jsx = jsxProd;
    exports.jsxs = jsxProd;
  }
});

// ../../node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "../../node_modules/react/cjs/react.production.js"(exports) {
    "use strict";
    var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = Symbol.for("react.memo");
    var REACT_LAZY_TYPE = Symbol.for("react.lazy");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    var ReactSharedInternals = { H: null, A: null, T: null, S: null, V: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key, self, source, owner, props) {
      self = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== self ? self : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(
        oldElement.type,
        newKey,
        void 0,
        void 0,
        void 0,
        oldElement.props
      );
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function noop$1() {
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop$1, noop$1) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result;
        ctor = ctor();
        ctor.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject;
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error;
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = ctor);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    function noop() {
    }
    exports.Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports.Component = Component;
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.Profiler = REACT_PROFILER_TYPE;
    exports.PureComponent = PureComponent;
    exports.StrictMode = REACT_STRICT_MODE_TYPE;
    exports.Suspense = REACT_SUSPENSE_TYPE;
    exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key = element.key, owner = void 0;
      if (null != config)
        for (propName in void 0 !== config.ref && (owner = void 0), void 0 !== config.key && (key = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key, void 0, void 0, owner, props);
    };
    exports.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports.createElement = function(type, config, children) {
      var propName, props = {}, key = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key, void 0, void 0, null, props);
    };
    exports.createRef = function() {
      return { current: null };
    };
    exports.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports.isValidElement = isValidElement;
    exports.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports.startTransition = function(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        ReactSharedInternals.T = prevTransition;
      }
    };
    exports.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports.useDebugValue = function() {
    };
    exports.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports.useEffect = function(create, createDeps, update) {
      var dispatcher = ReactSharedInternals.H;
      if ("function" === typeof update)
        throw Error(
          "useEffect CRUD overload is not enabled in this build of React."
        );
      return dispatcher.useEffect(create, createDeps);
    };
    exports.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports.version = "19.1.1";
  }
});

// ../../node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "../../node_modules/react/cjs/react.development.js"(exports, module) {
    "use strict";
    "production" !== process.env.NODE_ENV && function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return (type.displayName || "Context") + ".Provider";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, self, source, owner, props, debugStack, debugTask) {
        self = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== self ? self : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          void 0,
          void 0,
          oldElement._owner,
          oldElement.props,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function noop$1() {
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop$1, noop$1) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var ctor = payload._result;
          ctor = ctor();
          ctor.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status)
                payload._status = 1, payload._result = moduleObject;
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status)
                payload._status = 2, payload._result = error;
            }
          );
          -1 === payload._status && (payload._status = 0, payload._result = ctor);
        }
        if (1 === payload._status)
          return ctor = payload._result, void 0 === ctor && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ctor
          ), "default" in ctor || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ctor
          ), ctor.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function noop() {
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module && module[requireString]).call(
              module,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler");
      Symbol.for("react.provider");
      var REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      }, fnName;
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        V: null,
        actQueue: null,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      exports.Children = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports.Component = Component;
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.Profiler = REACT_PROFILER_TYPE;
      exports.PureComponent = PureComponent;
      exports.StrictMode = REACT_STRICT_MODE_TYPE;
      exports.Suspense = REACT_SUSPENSE_TYPE;
      exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports.__COMPILER_RUNTIME = deprecatedAPIs;
      exports.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key,
          void 0,
          void 0,
          owner,
          props,
          element._debugStack,
          element._debugTask
        );
        for (key = 2; key < arguments.length; key++)
          owner = arguments[key], isValidElement(owner) && owner._store && (owner._store.validated = 1);
        return props;
      };
      exports.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++) {
          var node = arguments[i];
          isValidElement(node) && node._store && (node._store.validated = 1);
        }
        i = {};
        node = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), node = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        node && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return ReactElement(
          type,
          node,
          void 0,
          void 0,
          getOwner(),
          i,
          propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports.isValidElement = isValidElement;
      exports.lazy = function(ctor) {
        return {
          $$typeof: REACT_LAZY_TYPE,
          _payload: { _status: -1, _result: ctor },
          _init: lazyInitializer
        };
      };
      exports.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports.startTransition = function(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        ReactSharedInternals.T = currentTransition;
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), ReactSharedInternals.T = prevTransition;
        }
      };
      exports.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports.useEffect = function(create, createDeps, update) {
        null == create && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        var dispatcher = resolveDispatcher();
        if ("function" === typeof update)
          throw Error(
            "useEffect CRUD overload is not enabled in this build of React."
          );
        return dispatcher.useEffect(create, createDeps);
      };
      exports.useId = function() {
        return resolveDispatcher().useId();
      };
      exports.useImperativeHandle = function(ref, create, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create, deps);
      };
      exports.useInsertionEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create, deps);
      };
      exports.useLayoutEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create, deps);
      };
      exports.useMemo = function(create, deps) {
        return resolveDispatcher().useMemo(create, deps);
      };
      exports.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports.version = "19.1.1";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    }();
  }
});

// ../../node_modules/react/index.js
var require_react = __commonJS({
  "../../node_modules/react/index.js"(exports, module) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module.exports = require_react_production();
    } else {
      module.exports = require_react_development();
    }
  }
});

// ../../node_modules/react/cjs/react-jsx-runtime.development.js
var require_react_jsx_runtime_development = __commonJS({
  "../../node_modules/react/cjs/react-jsx-runtime.development.js"(exports) {
    "use strict";
    "production" !== process.env.NODE_ENV && function() {
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return (type.displayName || "Context") + ".Provider";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, self, source, owner, props, debugStack, debugTask) {
        self = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== self ? self : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function jsxDEVImpl(type, config, maybeKey, isStaticChildren, source, self, debugStack, debugTask) {
        var children = config.children;
        if (void 0 !== children)
          if (isStaticChildren)
            if (isArrayImpl(children)) {
              for (isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)
                validateChildKeys(children[isStaticChildren]);
              Object.freeze && Object.freeze(children);
            } else
              console.error(
                "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
              );
          else validateChildKeys(children);
        if (hasOwnProperty.call(config, "key")) {
          children = getComponentNameFromType(type);
          var keys = Object.keys(config).filter(function(k) {
            return "key" !== k;
          });
          isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
          didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error(
            'A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />',
            isStaticChildren,
            children,
            keys,
            children
          ), didWarnAboutKeySpread[children + isStaticChildren] = true);
        }
        children = null;
        void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
        hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
        if ("key" in config) {
          maybeKey = {};
          for (var propName in config)
            "key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        children && defineKeyPropWarningGetter(
          maybeKey,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        return ReactElement(
          type,
          children,
          self,
          source,
          getOwner(),
          maybeKey,
          debugStack,
          debugTask
        );
      }
      function validateChildKeys(node) {
        "object" === typeof node && null !== node && node.$$typeof === REACT_ELEMENT_TYPE && node._store && (node._store.validated = 1);
      }
      var React = require_react(), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler");
      Symbol.for("react.provider");
      var REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      React = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(
        React,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutKeySpread = {};
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.jsx = function(type, config, maybeKey, source, self) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return jsxDEVImpl(
          type,
          config,
          maybeKey,
          false,
          source,
          self,
          trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports.jsxs = function(type, config, maybeKey, source, self) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return jsxDEVImpl(
          type,
          config,
          maybeKey,
          true,
          source,
          self,
          trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
    }();
  }
});

// ../../node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "../../node_modules/react/jsx-runtime.js"(exports, module) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module.exports = require_react_jsx_runtime_production();
    } else {
      module.exports = require_react_jsx_runtime_development();
    }
  }
});

// src/lib/planPdf.tsx
import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer
} from "@react-pdf/renderer";
function PlanPdfDocument({
  schoolName,
  className,
  weekRange,
  schoolYear,
  weekDays,
  subjects
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    Document,
    {
      title: `\u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u2014 ${className}`,
      author: schoolName,
      language: "ar",
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Page, { size: "A4", orientation: "landscape", style: s.page, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(View, { style: s.header, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { style: s.school, children: schoolName }),
          schoolYear ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { style: s.year, children: schoolYear }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { style: s.title, children: [
            "\u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u0644\u0644\u0635\u0641 ",
            className
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { style: s.weekBadge, children: weekRange })
        ] }),
        subjects.map((sub) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(View, { break: false, wrap: false, style: { marginBottom: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(View, { style: s.subjectHead, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { style: s.subjectName, children: [
              "\u0645\u0627\u062F\u0629 ",
              sub.subjectName
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { style: s.teacherName, children: [
              "\u0627\u0644\u0645\u0639\u0644\u0645: ",
              sub.teacherName,
              sub.missing ? "  \u2022  \u0644\u0645 \u062A\u064F\u0633\u0644\u064E\u0651\u0645" : ""
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(View, { style: s.table, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(View, { style: s.row, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { style: [s.headCell, { width: "12%" }], children: "\u0627\u0644\u0623\u064A\u0627\u0645" }),
              COLUMNS.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { style: [s.headCell, { width: "17.6%" }], children: c.label }, c.key))
            ] }),
            weekDays.map(({ weekday, name }) => {
              const e = sub.entries.find((x) => x.weekday === weekday);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(View, { style: s.row, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { style: [s.cell, s.dayCell], children: name }),
                COLUMNS.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { style: [s.cell, s.cellBody], children: e?.[c.key] ?? "" }, c.key))
              ] }, weekday);
            })
          ] })
        ] }, sub.subjectId)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { style: s.footer, children: [
          "\u0623\u064F\u0646\u0634\u0626 \u0622\u0644\u064A\u0627\u064B \u0639\u0628\u0631 \u0646\u0638\u0627\u0645 \u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0637\u0644\u0627\u0628 \u2014 ",
          schoolName
        ] })
      ] })
    }
  );
}
async function renderPlanPdf(props) {
  return renderToBuffer(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlanPdfDocument, { ...props }));
}
var import_jsx_runtime, FONT_DIR, BRAND, BRAND_LIGHT, s, COLUMNS;
var init_planPdf = __esm({
  "src/lib/planPdf.tsx"() {
    "use strict";
    import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
    FONT_DIR = path.join(process.cwd(), "public", "fonts");
    Font.register({
      family: "Amiri",
      fonts: [
        { src: path.join(FONT_DIR, "Amiri-Regular.ttf") },
        { src: path.join(FONT_DIR, "Amiri-Bold.ttf"), fontWeight: 700 }
      ]
    });
    Font.registerHyphenationCallback((word) => [word]);
    BRAND = "#0f766e";
    BRAND_LIGHT = "#f0fdfa";
    s = StyleSheet.create({
      page: { padding: 24, fontFamily: "Amiri", fontSize: 9, direction: "rtl" },
      header: { alignItems: "center", marginBottom: 12 },
      school: { fontSize: 11, color: "#475569", textAlign: "center" },
      year: { fontSize: 8, color: "#94a3b8", textAlign: "center", marginTop: 2 },
      title: { fontSize: 15, fontWeight: 700, textAlign: "center", marginTop: 6 },
      weekBadge: {
        marginTop: 6,
        backgroundColor: BRAND_LIGHT,
        color: BRAND,
        fontSize: 10,
        fontWeight: 700,
        paddingHorizontal: 14,
        paddingVertical: 3,
        borderRadius: 4,
        textAlign: "center"
      },
      subjectHead: {
        flexDirection: "row-reverse",
        justifyContent: "space-between",
        backgroundColor: BRAND,
        color: "#ffffff",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        marginTop: 10
      },
      subjectName: { fontSize: 11, fontWeight: 700 },
      teacherName: { fontSize: 9 },
      missing: { color: "#fbbf24", fontSize: 8 },
      table: { borderWidth: 0.5, borderColor: "#94a3b8" },
      row: { flexDirection: "row-reverse" },
      cell: {
        borderWidth: 0.5,
        borderColor: "#94a3b8",
        paddingHorizontal: 4,
        paddingVertical: 3,
        fontSize: 8,
        textAlign: "right"
      },
      dayCell: { fontWeight: 700, backgroundColor: BRAND_LIGHT, width: "12%" },
      cellBody: { width: "17.6%" },
      headCell: {
        borderWidth: 0.5,
        borderColor: "#94a3b8",
        paddingHorizontal: 4,
        paddingVertical: 4,
        fontSize: 8,
        fontWeight: 700,
        color: BRAND,
        backgroundColor: BRAND_LIGHT,
        textAlign: "right"
      },
      footer: {
        marginTop: 14,
        fontSize: 7,
        color: "#94a3b8",
        textAlign: "center"
      }
    });
    COLUMNS = [
      { key: "lessonTitle", label: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062F\u0631\u0633" },
      { key: "textbook", label: "\u0627\u0644\u0643\u062A\u0627\u0628 \u0627\u0644\u0645\u062F\u0631\u0633\u064A" },
      { key: "platforms", label: "\u0645\u0646\u0635\u0629 \u0623\u0644\u0641 \u0648\u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0630\u0643\u064A\u0629" },
      { key: "tests", label: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A" },
      { key: "notes", label: "\u0645\u0644\u0627\u062D\u0638\u0627\u062A" }
    ];
  }
});

// src/lib/jobs/planSend.ts
import { InputFile } from "grammy";
async function sendPlanJob(outboxEventId) {
  const event = await prisma.outboxEvent.findUnique({ where: { id: outboxEventId } });
  if (!event || event.status === "done" || event.status === "cancelled") return;
  const payload = event.payload;
  const pub = await prisma.classWeeklyPlanPublication.findUnique({
    where: { id: payload.publicationId },
    include: {
      class: { select: { displayName: true, name: true, academicYear: { select: { name: true } } } }
    }
  });
  if (!pub) throw new Error("\u0644\u0642\u0637\u0629 \u0627\u0644\u062E\u0637\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", attempts: { increment: 1 } }
  });
  try {
    let providerMsgId = null;
    if (event.channel === "telegram") {
      if (!payload.telegramChatId) throw new Error("\u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637 \u0628\u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645");
      const [settings, weekDays] = await Promise.all([
        prisma.schoolSettings.findUnique({ where: { id: "school" } }),
        schoolWeekDays()
      ]);
      const className = pub.class.displayName ?? pub.class.name;
      const fmt = (d) => d.toLocaleDateString("ar", { day: "numeric", month: "long", timeZone: "UTC" });
      const end = new Date(pub.weekStart);
      end.setUTCDate(end.getUTCDate() + 6);
      const weekRange = `${fmt(pub.weekStart)} \u2013 ${fmt(end)}`;
      const subjects = pub.contentJson;
      const done2 = subjects.filter((x) => !x.missing).length;
      const text = [
        `\u{1F4DA} \u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u2014 ${className}`,
        `\u0627\u0644\u0623\u0633\u0628\u0648\u0639: ${weekRange}`,
        `\u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u0645\u0634\u0645\u0648\u0644\u0629: ${done2}${subjects.length > done2 ? ` \u0645\u0646 ${subjects.length}` : ""}`,
        "",
        "\u0627\u0644\u0645\u0633\u062A\u0646\u062F \u0627\u0644\u0645\u0648\u062D\u0651\u062F \u0645\u0631\u0641\u0642 \u0623\u062F\u0646\u0627\u0647.",
        ...portalUrl() ? ["", `\u0628\u0648\u0627\u0628\u0629 \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631:
${portalUrl()}/plans`] : []
      ].join("\n");
      const api = botApi();
      for (const part of splitMessage(text)) {
        const msg = await api.sendMessage(payload.telegramChatId, part);
        providerMsgId = String(msg.message_id);
      }
      const pdf = await renderPlanPdf({
        schoolName: settings?.schoolName ?? "\u0627\u0644\u0645\u062F\u0631\u0633\u0629",
        className,
        schoolYear: pub.class.academicYear?.name,
        weekRange,
        weekDays,
        subjects
      });
      const doc = await api.sendDocument(
        payload.telegramChatId,
        new InputFile(pdf, `\u062E\u0637\u0629-\u0623\u0633\u0628\u0648\u0639\u064A\u0629-${pub.class.name}.pdf`),
        { caption: `\u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u0627\u0644\u0645\u0648\u062D\u0651\u062F\u0629 \u2014 ${className}` }
      );
      providerMsgId = String(doc.message_id);
    } else {
      providerMsgId = "portal";
    }
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: "success",
          providerMsgId
        }
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "done", lastError: null }
      })
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const ambiguous = /timeout|ETIMEDOUT|ECONNRESET/i.test(message);
    const maxed = event.attempts + 1 >= 8;
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: ambiguous ? "ambiguous" : "failed",
          error: message.slice(0, 500)
        }
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: ambiguous || maxed ? "failed" : "pending",
          lastError: message.slice(0, 500),
          nextAttemptAt: ambiguous ? /* @__PURE__ */ new Date() : new Date(Date.now() + Math.min(36e5, 6e4 * 2 ** event.attempts))
        }
      })
    ]);
    throw err;
  }
}
var init_planSend = __esm({
  "src/lib/jobs/planSend.ts"() {
    "use strict";
    init_src();
    init_src2();
    init_telegram();
    init_planPdf();
  }
});

// ../../packages/auth/src/accounts.ts
import { randomBytes } from "node:crypto";
function generatePassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const buf = randomBytes(10);
  return [...buf].map((b) => abc[b % abc.length]).join("");
}
async function uniqueUsername(base) {
  let candidate = base;
  for (let i = 2; ; i++) {
    const taken = await prisma.user.findUnique({ where: { username: candidate } });
    if (!taken) return candidate;
    candidate = `${base}_${i}`;
  }
}
async function createGuardianAccount(input) {
  const digits = (input.phone ?? "").replace(/\D/g, "").slice(-9) || "x";
  const username2 = await uniqueUsername(`g${digits}`);
  const res2 = await auth.api.signUpEmail({
    body: {
      email: `${username2}@internal.school`,
      password: input.password,
      name: input.displayName,
      username: username2
    }
  });
  const userId = res2.user?.id;
  if (!userId) throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631");
  const guardian = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        role: "guardian",
        mustChangePassword: input.mustChangePassword ?? false,
        telegramChatId: input.telegramChatId ?? null
      }
    });
    return tx.guardianProfile.create({
      data: { userId, phone: input.phone }
    });
  }).catch(async (e) => {
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {
    });
    throw e;
  });
  return { userId, guardianId: guardian.id, username: username2 };
}
var init_accounts = __esm({
  "../../packages/auth/src/accounts.ts"() {
    "use strict";
    init_src();
    init_src3();
  }
});

// ../../packages/auth/src/index.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username, admin as adminPlugin } from "better-auth/plugins";
var auth;
var init_src3 = __esm({
  "../../packages/auth/src/index.ts"() {
    "use strict";
    init_src();
    init_accounts();
    auth = betterAuth({
      database: prismaAdapter(prisma, { provider: "postgresql" }),
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        disableSignUp: true
        // لا تسجيل عام — دعوات فقط
      },
      plugins: [
        username(),
        adminPlugin({
          defaultRole: "teacher",
          adminRoles: ["admin"]
        })
      ],
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        // أسبوع
        updateAge: 60 * 60 * 24,
        // تمديد يومي
        cookieCache: { enabled: false }
        // جلسات قاعدة بيانات قابلة للإبطال
      },
      user: {
        additionalFields: {
          role: { type: "string", defaultValue: "teacher" },
          isActive: { type: "boolean", defaultValue: true },
          phone: { type: "string", required: false },
          telegramChatId: { type: "string", required: false },
          mustChangePassword: { type: "boolean", defaultValue: false }
        }
      },
      trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"]
    });
  }
});

// src/lib/jobs/teacherBot.ts
async function teacherByChat(chatId) {
  return prisma.user.findFirst({
    where: {
      telegramChatId: String(chatId),
      isActive: true,
      role: { in: ["teacher", "admin"] }
    },
    select: { id: true, name: true, role: true, telegramState: true }
  });
}
async function setState(userId, patch) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramState: true } });
  const cur = u?.telegramState ?? {};
  const next = { ...cur, ...patch };
  for (const k of Object.keys(next)) if (next[k] === void 0) delete next[k];
  await prisma.user.update({
    where: { id: userId },
    data: { telegramState: next }
  });
}
function lessonsKb(lessons, prefix) {
  return {
    inline_keyboard: lessons.map((l) => [{
      text: `${l.sessionStatus === "submitted" ? "\u{1F512} " : ""}\u062D\u0635\u0629 ${l.period} \u2014 ${l.className} \u2014 ${l.subjectName}`,
      callback_data: `${prefix}:${l.slotId}`
    }])
  };
}
function rosterKb(sessionId, students, tapPrefix, savePrefix) {
  const rows = students.map((s2) => [{
    text: `${s2.mark} ${s2.fullName}`,
    callback_data: `${tapPrefix}:${sessionId}:${s2.studentId}`
  }]);
  rows.push([{ text: "\u{1F4BE} \u062D\u0641\u0638 \u0627\u0644\u0643\u0644", callback_data: `${savePrefix}:${sessionId}` }]);
  return { inline_keyboard: rows };
}
function rosterHeader(className, subject, period, icon) {
  return `${icon} \xAB${className}\xBB \u2014 ${subject} \u2014 \u062D\u0635\u0629 ${period}`;
}
async function attendanceKb(api, actor, chatId, sessionId) {
  const roster = await sessionRoster(actor, sessionId);
  const kb = rosterKb(
    sessionId,
    roster.students.map((s2) => ({
      studentId: s2.studentId,
      fullName: s2.fullName,
      mark: s2.status ? ATT_EMOJI[s2.status] : NO_MARK
    })),
    "mk",
    "sv"
  );
  await api.sendMessage(
    chatId,
    `${rosterHeader(roster.session.className, roster.session.subjectName, roster.session.period, "\u{1F4CB} \u062D\u0636\u0648\u0631")}
\u0643\u0644 \u0632\u0631 \u064A\u062F\u0648\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0627\u0644\u0628 \u0639\u0646\u062F \u0627\u0644\u0636\u063A\u0637. \xAB\u{1F4BE} \u062D\u0641\u0638 \u0627\u0644\u0643\u0644\xBB \u0639\u0646\u062F \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621.`,
    { reply_markup: kb }
  );
}
async function behaviorKb(api, actor, chatId, sessionId) {
  const roster = await sessionRoster(actor, sessionId);
  const entries = await prisma.behaviorEntry.findMany({
    where: { lessonSessionId: sessionId, teacherId: actor.userId, category: { not: null } },
    orderBy: { createdAt: "asc" }
  });
  const current = /* @__PURE__ */ new Map();
  for (const e of entries) current.set(e.studentId, e.category);
  const kb = rosterKb(
    sessionId,
    roster.students.map((s2) => ({
      studentId: s2.studentId,
      fullName: s2.fullName,
      mark: current.has(s2.studentId) ? BEH_EMOJI[current.get(s2.studentId)] : NO_MARK
    })),
    "bk",
    "bv"
  );
  await api.sendMessage(
    chatId,
    `${rosterHeader(roster.session.className, roster.session.subjectName, roster.session.period, "\u{1F5D2}\uFE0F \u0633\u0644\u0648\u0643")}
\u0643\u0644 \u0632\u0631 \u064A\u062F\u0648\u0631 \u0633\u0644\u0648\u0643 \u0627\u0644\u0637\u0627\u0644\u0628 (\u0645\u0644\u062A\u0632\u0645 \u2192 \u0645\u0645\u062A\u0627\u0632 \u2192 \u064A\u062D\u062A\u0627\u062C \u0645\u062A\u0627\u0628\u0639\u0629). \xAB\u{1F4BE}\xBB \u0644\u0644\u0645\u0644\u062E\u0635.`,
    { reply_markup: kb }
  );
}
async function handleTeacherText(t, chatId, text) {
  const api = botApi();
  const actor = actorOf(t);
  const state = t.telegramState ?? null;
  if (ATT_TRIGGERS.has(text) || BEH_TRIGGERS.has(text)) {
    const kind = ATT_TRIGGERS.has(text) ? "att" : "beh";
    const lessons = await lessonsForTeacher(actor, schoolToday(await schoolTimezone()));
    const open = lessons.filter((l) => l.sessionStatus !== "submitted");
    if (!open.length) {
      await api.sendMessage(chatId, "\u0644\u0627 \u062D\u0635\u0635 \u0645\u0633\u0646\u062F\u0629 \u0644\u0643 \u0627\u0644\u064A\u0648\u0645 (\u0623\u0648 \u0643\u0644\u0647\u0627 \u0645\u0639\u062A\u0645\u062F\u0629).");
      return;
    }
    await api.sendMessage(
      chatId,
      `\u0627\u062E\u062A\u0631 \u0627\u0644\u062D\u0635\u0629 \u0644\u062A\u0633\u062C\u064A\u0644 ${kind === "att" ? "\u0627\u0644\u062D\u0636\u0648\u0631" : "\u0627\u0644\u0633\u0644\u0648\u0643"}:`,
      { reply_markup: lessonsKb(open, kind === "att" ? "ta" : "tb") }
    );
    return;
  }
  const year2 = await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!year2) return;
  const q = text.trim().replace(/\s+/g, " ");
  const found = await prisma.enrollment.findMany({
    where: {
      academicYearId: year2.id,
      student: { isActive: true, fullName: { contains: q } },
      class: { assignments: { some: { teacherId: t.id, isActive: true } } }
    },
    include: { student: { select: { id: true, fullName: true } }, class: { select: { displayName: true } } },
    take: 16
  });
  const uniq = [...new Map(found.map((f) => [f.student.id, f])).values()];
  if (!uniq.length) {
    await api.sendMessage(chatId, `\u0644\u0645 \u0623\u062C\u062F \u0637\u0627\u0644\u0628\u0627\u064B \u0628\u0627\u0633\u0645 \xAB${q}\xBB \u0636\u0645\u0646 \u0635\u0641\u0648\u0641\u0643 \u2014 \u062C\u0631\u0651\u0628 \u062C\u0632\u0621\u0627\u064B \u0645\u0646 \u0627\u0644\u0627\u0633\u0645.`);
    return;
  }
  if (uniq.length === 1) {
    await sendTeacherReport(api, actor, chatId, uniq[0].student.id);
    return;
  }
  await api.sendMessage(
    chatId,
    `\u0648\u062C\u062F\u062A ${uniq.length} \u0637\u0644\u0627\u0628\u0627\u064B \u2014 \u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u0642\u0635\u0648\u062F:`,
    {
      reply_markup: {
        inline_keyboard: uniq.slice(0, 8).map((f) => [{
          text: `${f.student.fullName} \u2014 ${f.class.displayName}`,
          callback_data: `st:${f.student.id}`
        }])
      }
    }
  );
}
async function sendTeacherReport(api, actor, chatId, studentId) {
  try {
    const rangeEnd = schoolToday(await schoolTimezone());
    const rangeStart = new Date(rangeEnd);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);
    const content = await buildStudentReport(actor, { studentId, rangeStart, rangeEnd });
    const settings = await prisma.schoolSettings.findUnique({ where: { id: "school" } });
    const text = renderReportText(content, settings?.schoolName ?? "\u0627\u0644\u0645\u062F\u0631\u0633\u0629");
    const parts = splitMessage(text);
    for (let i = 0; i < parts.length; i++) {
      await api.sendMessage(chatId, parts[i], i === parts.length - 1 ? { reply_markup: { inline_keyboard: [[{ text: "\u2B50 \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0637\u0627\u0644\u0628", callback_data: `em:${studentId}` }]] } } : {});
    }
  } catch {
    await api.sendMessage(chatId, "\u0647\u0630\u0627 \u0627\u0644\u0637\u0627\u0644\u0628 \u062E\u0627\u0631\u062C \u0646\u0637\u0627\u0642 \u062A\u062F\u0631\u064A\u0633\u0643.");
  }
}
async function handleTeacherCallback(t, cq) {
  const api = botApi();
  const actor = actorOf(t);
  const data = cq.data ?? "";
  const chatId = cq.message.chat.id;
  const msgId = cq.message.message_id;
  const parts = data.split(":");
  const kind = parts[0];
  await api.answerCallbackQuery(cq.id);
  try {
    if (kind === "ta" || kind === "tb") {
      const session = await ensureSession(actor, parts[1], schoolToday(await schoolTimezone()));
      if (kind === "ta") await attendanceKb(api, actor, chatId, session.id);
      else await behaviorKb(api, actor, chatId, session.id);
      return;
    }
    if (kind === "bh") {
      await behaviorKb(api, actor, chatId, parts[1]);
      return;
    }
    if (kind === "mk" || kind === "bk") {
      const sessionId = parts[1], studentId = parts[2];
      if (kind === "mk") {
        const cur = await prisma.attendanceEntry.findUnique({
          where: { lessonSessionId_studentId: { lessonSessionId: sessionId, studentId } }
        });
        const next = ATT_CYCLE[(ATT_CYCLE.indexOf(cur?.status) + 1) % ATT_CYCLE.length];
        await recordAttendance(actor, { sessionId, studentId, status: next });
        await refreshAttendanceKb(api, actor, chatId, msgId, sessionId);
      } else {
        const entries = await prisma.behaviorEntry.findMany({
          where: { lessonSessionId: sessionId, studentId, teacherId: actor.userId, category: { not: null } },
          orderBy: { createdAt: "desc" }
        });
        const cur = entries[0]?.category;
        const next = BEH_CYCLE[(BEH_CYCLE.indexOf(cur) + 1) % BEH_CYCLE.length];
        await prisma.behaviorEntry.deleteMany({
          where: { lessonSessionId: sessionId, studentId, teacherId: actor.userId }
        });
        await recordBehavior(actor, { studentId, date: schoolToday(await schoolTimezone()), category: next, lessonSessionId: sessionId, audience: "family" });
        await refreshBehaviorKb(api, actor, chatId, msgId, sessionId);
      }
      return;
    }
    if (kind === "sv") {
      const sessionId = parts[1];
      const roster = await sessionRoster(actor, sessionId);
      const counts = /* @__PURE__ */ new Map();
      let unmarked = 0;
      for (const s2 of roster.students) {
        if (!s2.status) unmarked++;
        else counts.set(s2.status, (counts.get(s2.status) ?? 0) + 1);
      }
      const summary = [...counts.entries()].map(([k, v]) => `${ATT_EMOJI[k]} ${LESSON_STATUS_AR[k]}: ${v}`).join("  |  ");
      await api.sendMessage(
        chatId,
        `\u2705 \u062D\u064F\u0641\u0638 \u062D\u0636\u0648\u0631 \xAB${roster.session.className}\xBB \u2014 \u062D\u0635\u0629 ${roster.session.period}
${summary}` + (unmarked ? `
${NO_MARK} \u0628\u0644\u0627 \u0631\u0635\u062F: ${unmarked}` : ""),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "\u{1F50F} \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062D\u0635\u0629", callback_data: `sm:${sessionId}` }],
              [{ text: "\u{1F5D2}\uFE0F \u0633\u0644\u0648\u0643 \u0646\u0641\u0633 \u0627\u0644\u062D\u0635\u0629", callback_data: `bh:${sessionId}` }]
            ]
          }
        }
      );
      return;
    }
    if (kind === "bv") {
      const sessionId = parts[1];
      const entries = await prisma.behaviorEntry.findMany({
        where: { lessonSessionId: sessionId, teacherId: actor.userId, category: { not: null } },
        orderBy: { createdAt: "asc" }
      });
      const current = /* @__PURE__ */ new Map();
      for (const e of entries) current.set(e.studentId, e.category);
      const counts = /* @__PURE__ */ new Map();
      for (const v of current.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
      const summary = [...counts.entries()].map(([k, v]) => `${BEH_EMOJI[k]} ${BEHAVIOR_AR[k]}: ${v}`).join("  |  ");
      await api.sendMessage(chatId, `\u2705 \u062D\u064F\u0641\u0638 \u0633\u0644\u0648\u0643 \u0627\u0644\u062D\u0635\u0629
${summary || "\u2014 \u0644\u0627 \u0633\u062C\u0644\u0627\u062A \u2014"}`);
      return;
    }
    if (kind === "sm") {
      await submitSession(actor, parts[1]);
      await api.sendMessage(chatId, "\u{1F50F} \u0627\u0639\u062A\u064F\u0645\u062F\u062A \u0627\u0644\u062D\u0635\u0629 \u2014 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0644\u0627\u062D\u0642\u0627\u064B \u064A\u062A\u0637\u0644\u0628 \u0625\u0639\u0627\u062F\u0629 \u0641\u062A\u062D \u0645\u0646 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.");
      return;
    }
    if (kind === "st") {
      await sendTeacherReport(api, actor, chatId, parts[1]);
      return;
    }
    if (kind === "em") {
      await startEvaluation(api, actor, t, chatId, parts[1]);
      return;
    }
    if (kind === "es") {
      const st = t.telegramState?.ev;
      await setState(t.id, { ev: { ...st, subjectId: parts[2], values: {} } });
      await evalStep(api, chatId, { ...st, subjectId: parts[2], values: {} }, 0);
      return;
    }
    if (kind === "ep" || kind === "ea" || kind === "eb") {
      const stepIdx = kind === "ep" ? 0 : kind === "ea" ? 1 : 2;
      const st = t.telegramState?.ev;
      if (!st) {
        await api.sendMessage(chatId, "\u0627\u0646\u062A\u0647\u062A \u0627\u0644\u062C\u0644\u0633\u0629 \u2014 \u0623\u0639\u062F \u0641\u062A\u062D \u0627\u0644\u062A\u0642\u064A\u064A\u0645.");
        return;
      }
      const step = EV_STEPS[stepIdx];
      st.values[step.category] = step.options[Number(parts[1])] ?? step.options[0];
      await setState(t.id, { ev: st });
      if (stepIdx < 2) await evalStep(api, chatId, st, stepIdx + 1);
      else await finishEvaluation(api, actor, t.id, chatId, st);
      return;
    }
    if (kind === "el") {
      await applyEvalToClass(api, actor, t, chatId, parts[1]);
      return;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    await api.sendMessage(chatId, msg.includes("\u0645\u0639\u062A\u0645\u062F\u0629") || msg.includes("\u0625\u0633\u0646\u0627\u062F") ? `\u26A0\uFE0F ${msg}` : "\u062A\u0639\u0630\u0651\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u2014 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  }
}
async function refreshAttendanceKb(api, actor, chatId, msgId, sessionId) {
  const roster = await sessionRoster(actor, sessionId);
  await api.editMessageReplyMarkup(chatId, msgId, {
    reply_markup: rosterKb(
      sessionId,
      roster.students.map((s2) => ({
        studentId: s2.studentId,
        fullName: s2.fullName,
        mark: s2.status ? ATT_EMOJI[s2.status] : NO_MARK
      })),
      "mk",
      "sv"
    )
  });
}
async function refreshBehaviorKb(api, actor, chatId, msgId, sessionId) {
  const roster = await sessionRoster(actor, sessionId);
  const entries = await prisma.behaviorEntry.findMany({
    where: { lessonSessionId: sessionId, teacherId: actor.userId, category: { not: null } },
    orderBy: { createdAt: "asc" }
  });
  const current = /* @__PURE__ */ new Map();
  for (const e of entries) current.set(e.studentId, e.category);
  await api.editMessageReplyMarkup(chatId, msgId, {
    reply_markup: rosterKb(
      sessionId,
      roster.students.map((s2) => ({
        studentId: s2.studentId,
        fullName: s2.fullName,
        mark: current.has(s2.studentId) ? BEH_EMOJI[current.get(s2.studentId)] : NO_MARK
      })),
      "bk",
      "bv"
    )
  });
}
async function startEvaluation(api, actor, t, chatId, studentId) {
  const year2 = await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!year2) return;
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, academicYearId: year2.id }
  });
  if (!enrollment) {
    await api.sendMessage(chatId, "\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0633\u062C\u0644 \u0641\u064A \u0635\u0641 \u0647\u0630\u0627 \u0627\u0644\u0639\u0627\u0645.");
    return;
  }
  const subjects = await prisma.teachingAssignment.findMany({
    where: { teacherId: t.id, classId: enrollment.classId, academicYearId: year2.id, isActive: true },
    include: { subject: { select: { id: true, name: true } } }
  });
  if (!subjects.length) {
    await api.sendMessage(chatId, "\u0644\u0627 \u0645\u0627\u062F\u0629 \u0645\u0633\u0646\u062F\u0629 \u0644\u0643 \u0641\u064A \u0635\u0641 \u0647\u0630\u0627 \u0627\u0644\u0637\u0627\u0644\u0628.");
    return;
  }
  const ev = { studentId, subjectId: "", values: {} };
  if (subjects.length === 1) {
    ev.subjectId = subjects[0].subjectId;
    await setState(t.id, { ev });
    await evalStep(api, chatId, ev, 0);
    return;
  }
  await setState(t.id, { ev });
  await api.sendMessage(chatId, "\u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u0627\u062F\u0629 \u0644\u0644\u062A\u0642\u064A\u064A\u0645:", {
    reply_markup: {
      inline_keyboard: subjects.map((s2) => [{
        text: s2.subject.name,
        callback_data: `es:${studentId}:${s2.subjectId}`
      }])
    }
  });
}
async function evalStep(api, chatId, ev, idx) {
  const step = EV_STEPS[idx];
  const prefix = idx === 0 ? "ep" : idx === 1 ? "ea" : "eb";
  await api.sendMessage(
    chatId,
    `\u2B50 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u2014 ${idx + 1}/3 ${step.label}:`,
    {
      reply_markup: {
        inline_keyboard: step.options.map((o, i) => [{ text: o, callback_data: `${prefix}:${i}` }])
      }
    }
  );
}
async function finishEvaluation(api, actor, userId, chatId, ev) {
  const weekStart2 = weekStartOf(schoolToday(await schoolTimezone()));
  for (const [category, value] of Object.entries(ev.values)) {
    await setEvaluation(actor, {
      studentId: ev.studentId,
      subjectId: ev.subjectId,
      weekStart: weekStart2,
      category,
      value
    });
  }
  await setState(userId, { ev: void 0 });
  const student2 = await prisma.student.findUnique({ where: { id: ev.studentId }, select: { fullName: true } });
  await api.sendMessage(
    chatId,
    `\u2B50 \u062D\u064F\u0641\u0638 \u062A\u0642\u064A\u064A\u0645 ${student2?.fullName ?? "\u0627\u0644\u0637\u0627\u0644\u0628"} \u0644\u0647\u0630\u0627 \u0627\u0644\u0623\u0633\u0628\u0648\u0639:
` + Object.entries(ev.values).map(([k, v]) => `  \u25AB\uFE0F ${k}: ${v}`).join("\n") + `
  \u25AB\uFE0F \u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629 \u0648\u0627\u0644\u062A\u0642\u062F\u064A\u0631 \u062A\u064F\u062D\u0633\u0628 \u0645\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0622\u0644\u064A\u0627\u064B`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "\u{1F465} \u062A\u0637\u0628\u064A\u0642 \u0639\u0644\u0649 \u0627\u0644\u0635\u0641 \u0643\u0627\u0645\u0644\u0627\u064B", callback_data: `el:${ev.studentId}` }
        ]]
      }
    }
  );
}
async function applyEvalToClass(api, actor, t, chatId, studentId) {
  const year2 = await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  const enrollment = year2 ? await prisma.enrollment.findFirst({
    where: { studentId, academicYearId: year2.id }
  }) : null;
  const st = t.telegramState?.ev;
  const weekStart2 = weekStartOf(schoolToday(await schoolTimezone()));
  const evals = await prisma.evaluation.findMany({
    where: { teacherId: t.id, studentId, weekStart: weekStart2, ...st?.subjectId ? { subjectId: st.subjectId } : {} }
  });
  if (!enrollment || !evals.length) {
    await api.sendMessage(chatId, "\u0644\u0627 \u062A\u0642\u064A\u064A\u0645 \u0645\u062D\u0641\u0648\u0638 \u0644\u0647\u0630\u0627 \u0627\u0644\u0637\u0627\u0644\u0628.");
    return;
  }
  const classmates = await prisma.enrollment.findMany({
    where: { classId: enrollment.classId, academicYearId: year2.id, student: { isActive: true } },
    select: { studentId: true }
  });
  let n = 0;
  for (const c of classmates) {
    for (const e of evals) {
      if (!e.subjectId) continue;
      await setEvaluation(actor, {
        studentId: c.studentId,
        subjectId: e.subjectId,
        weekStart: weekStart2,
        category: e.category,
        value: e.value
      });
    }
    n++;
  }
  await api.sendMessage(chatId, `\u{1F465} \u0637\u064F\u0628\u0651\u0642 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0639\u0644\u0649 ${n} \u0637\u0627\u0644\u0628\u0627\u064B \u0641\u064A \u0627\u0644\u0635\u0641.`);
}
var ATT_CYCLE, ATT_EMOJI, NO_MARK, BEH_CYCLE, BEH_EMOJI, ATT_TRIGGERS, BEH_TRIGGERS, EV_STEPS, actorOf;
var init_teacherBot = __esm({
  "src/lib/jobs/teacherBot.ts"() {
    "use strict";
    init_src();
    init_src2();
    init_telegram();
    ATT_CYCLE = ["present", "absent", "late", "excused"];
    ATT_EMOJI = {
      present: "\u2705",
      absent: "\u274C",
      late: "\u23F0",
      excused: "\u{1F7E1}"
    };
    NO_MARK = "\u26AA";
    BEH_CYCLE = ["committed", "excellent", "needs_followup"];
    BEH_EMOJI = {
      committed: "\u{1F7E2}",
      excellent: "\u{1F31F}",
      needs_followup: "\u26A0\uFE0F"
    };
    ATT_TRIGGERS = /* @__PURE__ */ new Set(["\u062D\u0636\u0648\u0631", "\u0627\u0644\u062D\u0636\u0648\u0631", "\u063A\u064A\u0627\u0628", "\u0627\u0644\u063A\u064A\u0627\u0628", "\u062F\u0648\u0627\u0645", "\u0627\u0644\u062F\u0648\u0627\u0645"]);
    BEH_TRIGGERS = /* @__PURE__ */ new Set(["\u0633\u0644\u0648\u0643", "\u0627\u0644\u0633\u0644\u0648\u0643"]);
    EV_STEPS = [
      { key: "part", category: "\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629", label: "\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629", options: WEEKLY_EVAL_OPTIONS["\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629"] },
      { key: "alef", category: "\u0643\u062A\u0627\u0628 \u0623", label: "\u0645\u0647\u0627\u0645 \u0623\u0644\u0641", options: WEEKLY_EVAL_OPTIONS["\u0643\u062A\u0627\u0628 \u0623"] },
      { key: "books", category: "\u0627\u0644\u0643\u062A\u0628", label: "\u0627\u0644\u062D\u0636\u0648\u0631 \u0648\u0627\u0644\u0643\u062A\u0628", options: WEEKLY_EVAL_OPTIONS["\u0627\u0644\u0643\u062A\u0628"] }
    ];
    actorOf = (t) => ({
      userId: t.id,
      role: t.role,
      isActive: true
    });
  }
});

// src/lib/jobs/telegramInbox.ts
function normalizePhone(p) {
  return p.replace(/\D/g, "").replace(/^0+/, "");
}
async function processTelegramUpdate(inboxId) {
  const claim = await prisma.telegramUpdateInbox.updateMany({
    where: { id: inboxId, status: "pending" },
    data: { status: "processing" }
  });
  if (!claim.count) return;
  const inbox = await prisma.telegramUpdateInbox.findUnique({
    where: { id: inboxId }
  });
  if (!inbox) return;
  const update = inbox.payload;
  const msg = update.message;
  const cq = update.callback_query;
  const api = botApi();
  try {
    if (cq?.message && cq.data !== void 0) {
      const teacher = await teacherByChat(cq.message.chat.id);
      if (teacher) await handleTeacherCallback(teacher, cq);
      else await api.answerCallbackQuery(cq.id, { text: "\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u062D\u0633\u0627\u0628 \u0645\u0639\u0644\u0645." });
    } else if (msg?.contact?.phone_number) {
      await linkByContact(msg);
    } else if (msg?.text) {
      const chatId = msg.chat.id;
      const teacher = await teacherByChat(chatId);
      const text = msg.text;
      if (text.startsWith("/start")) {
        if (teacher) {
          await api.sendMessage(
            chatId,
            `\u0623\u0647\u0644\u0627\u064B \u0623. ${teacher.name}

\u2022 \u0623\u0631\u0633\u0644 \xAB\u062D\u0636\u0648\u0631\xBB \u0644\u062A\u0633\u062C\u064A\u0644 \u062D\u0636\u0648\u0631 \u062D\u0635\u0629\u060C \xAB\u0633\u0644\u0648\u0643\xBB \u0644\u0631\u0635\u062F \u0633\u0644\u0648\u0643\u0647\u0627
\u2022 \u0623\u0631\u0633\u0644 \u0627\u0633\u0645 \u0637\u0627\u0644\u0628 \u0644\u062A\u0642\u0631\u064A\u0631\u0647 \u0648\u0645\u0639\u0627\u0644\u062C \u062A\u0642\u064A\u064A\u0645\u0647
\u2022 /status \u0644\u062D\u0627\u0644\u0629 \u0627\u0644\u0631\u0628\u0637 \u2014 /stop \u0644\u0625\u0644\u063A\u0627\u0626\u0647`
          );
        } else {
          await api.sendMessage(
            chatId,
            "\u0645\u0631\u062D\u0628\u0627\u064B \u0628\u0643 \u0641\u064A \u0646\u0638\u0627\u0645 \u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0637\u0644\u0627\u0628.\n\u2022 \u0644\u0631\u0628\u0637 \u062D\u0633\u0627\u0628\u0643: \u0627\u0636\u063A\u0637 \u0632\u0631 \xAB\u0645\u0634\u0627\u0631\u0643\u0629 \u062C\u0647\u0629 \u0627\u062A\u0635\u0627\u0644\u064A\xBB \u0628\u0627\u0644\u0623\u0633\u0641\u0644.\n\u2022 /status \u0644\u062D\u0627\u0644\u0629 \u0627\u0644\u0631\u0628\u0637 \u2014 /stop \u0644\u0625\u0644\u063A\u0627\u0626\u0647.\n\u2022 \u0623\u0631\u0633\u0644 \u0627\u0633\u0645 \u0627\u0628\u0646\u0643/\u0627\u0628\u0646\u062A\u0643 \u0644\u0637\u0644\u0628 \u062A\u0642\u0631\u064A\u0631 \u0622\u062E\u0631 7 \u0623\u064A\u0627\u0645.",
            CONTACT_KEYBOARD
          );
        }
      } else if (text.startsWith("/status")) {
        if (teacher) await api.sendMessage(chatId, `\u062D\u0633\u0627\u0628\u0643 \u0645\u0631\u062A\u0628\u0637 \u0643\u0645\u0639\u0644\u0645: ${teacher.name}`);
        else await sendStatus(msg);
      } else if (text.startsWith("/stop")) {
        await unlink(msg);
      } else if (teacher) {
        await handleTeacherText(teacher, chatId, text.trim());
      } else {
        await reportOnDemand(msg);
      }
    }
    await prisma.telegramUpdateInbox.update({
      where: { id: inbox.id },
      data: { status: "processed", processedAt: /* @__PURE__ */ new Date() }
    });
  } catch (err) {
    await prisma.telegramUpdateInbox.update({
      where: { id: inbox.id },
      data: { status: "failed", processedAt: /* @__PURE__ */ new Date() }
    });
    throw err;
  }
}
async function guardianByChat(chatId) {
  const user = await prisma.user.findFirst({
    where: { telegramChatId: String(chatId), isActive: true }
  });
  if (!user) return null;
  return prisma.guardianProfile.findUnique({
    where: { userId: user.id },
    include: {
      user: true,
      children: {
        where: { verified: true },
        include: { student: { select: { id: true, fullName: true, isActive: true } } }
      }
    }
  });
}
async function sendStatus(msg) {
  const api = botApi();
  const g = await guardianByChat(msg.chat.id);
  if (!g) {
    await api.sendMessage(
      msg.chat.id,
      "\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637\u0629. \u0627\u0636\u063A\u0637 \xAB\u0645\u0634\u0627\u0631\u0643\u0629 \u062C\u0647\u0629 \u0627\u062A\u0635\u0627\u0644\u064A\xBB \u0628\u0627\u0644\u0623\u0633\u0641\u0644 \u0644\u0631\u0628\u0637 \u062D\u0633\u0627\u0628\u0643.",
      CONTACT_KEYBOARD
    );
    return;
  }
  const kids = g.children.map((c) => `\u2022 ${c.student.fullName}`).join("\n");
  await api.sendMessage(
    msg.chat.id,
    `\u062D\u0633\u0627\u0628\u0643 \u0645\u0631\u062A\u0628\u0637 \u064A\u0627 ${g.user.name}.
\u0627\u0644\u0623\u0628\u0646\u0627\u0621 \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u0648\u0646 (${g.children.length}):
${kids || "\u2014"}`
  );
}
async function unlink(msg) {
  const api = botApi();
  const res2 = await prisma.user.updateMany({
    where: { telegramChatId: String(msg.chat.id) },
    data: { telegramChatId: null }
  });
  await api.sendMessage(
    msg.chat.id,
    res2.count ? "\u0623\u064F\u0644\u063A\u064A \u0631\u0628\u0637 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629. \u0644\u0646 \u062A\u0635\u0644\u0643 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0647\u0646\u0627 \u2014 \u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u062A\u0628\u0642\u0649 \u0645\u062A\u0627\u062D\u0629." : "\u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637\u0629 \u0623\u0635\u0644\u0627\u064B."
  );
}
async function reportOnDemand(msg) {
  const api = botApi();
  const g = await guardianByChat(msg.chat.id);
  if (!g) {
    await api.sendMessage(
      msg.chat.id,
      "\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u0648\u0644\u064A \u0623\u0645\u0631 \u0645\u0648\u062B\u0642. \u0627\u0636\u063A\u0637 \xAB\u0645\u0634\u0627\u0631\u0643\u0629 \u062C\u0647\u0629 \u0627\u062A\u0635\u0627\u0644\u064A\xBB \u0628\u0627\u0644\u0623\u0633\u0641\u0644 \u0644\u0631\u0628\u0637 \u062D\u0633\u0627\u0628\u0643.",
      CONTACT_KEYBOARD
    );
    return;
  }
  const q = msg.text.trim().replace(/\s+/g, " ");
  const student2 = g.children.find(
    (c) => c.student.isActive && (c.student.fullName.includes(q) || q.includes(c.student.fullName))
  )?.student;
  if (!student2) {
    await api.sendMessage(
      msg.chat.id,
      "\u0644\u0645 \u064A\u064F\u0639\u062B\u0631 \u0639\u0644\u0649 \u0637\u0627\u0644\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0627\u0633\u0645 \u0636\u0645\u0646 \u0623\u0628\u0646\u0627\u0626\u0643 \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u064A\u0646. \u062A\u0623\u0643\u062F \u0645\u0646 \u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0631\u0627\u062C\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629."
    );
    return;
  }
  const tz = await schoolTimezone();
  const rangeEnd = schoolToday(tz);
  const rangeStart = new Date(rangeEnd);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);
  let snap = await prisma.reportSnapshot.findFirst({
    where: { studentId: student2.id, rangeStart, rangeEnd, status: { in: ["approved", "sent"] } },
    orderBy: { createdAt: "desc" }
  });
  if (!snap) {
    const content = await buildStudentReport(SYSTEM_ACTOR2, {
      studentId: student2.id,
      rangeStart,
      rangeEnd
    });
    snap = await prisma.reportSnapshot.create({
      data: {
        studentId: student2.id,
        rangeStart,
        rangeEnd,
        contentJson: content,
        status: "approved",
        approvedById: SYSTEM_ACTOR2.userId,
        approvedAt: /* @__PURE__ */ new Date()
      }
    });
  }
  const today = schoolTodayStr(tz);
  await prisma.outboxEvent.upsert({
    where: { idempotencyKey: `ondemand:${student2.id}:${g.id}:${today}` },
    create: {
      type: "report_send",
      channel: "telegram",
      idempotencyKey: `ondemand:${student2.id}:${g.id}:${today}`,
      payload: {
        reportSnapshotId: snap.id,
        studentId: student2.id,
        guardianId: g.id,
        telegramChatId: String(msg.chat.id)
      }
    },
    update: {}
  });
  await api.sendMessage(msg.chat.id, `\u0633\u064A\u0635\u0644\u0643 \u062A\u0642\u0631\u064A\u0631 \xAB${student2.fullName}\xBB \u062E\u0644\u0627\u0644 \u0644\u062D\u0638\u0627\u062A \u0625\u0646 \u0634\u0627\u0621 \u0627\u0644\u0644\u0647.`);
}
async function linkByContact(msg) {
  const api = botApi();
  if (!msg.contact.user_id || msg.contact.user_id !== msg.from?.id) {
    await api.sendMessage(
      msg.chat.id,
      "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u0631\u0628\u0637 \u0628\u062C\u0647\u0629 \u0627\u062A\u0635\u0627\u0644 \u0644\u064A\u0633\u062A \u0644\u0643. \u0627\u0636\u063A\u0637 \xAB\u0645\u0634\u0627\u0631\u0643\u0629 \u062C\u0647\u0629 \u0627\u062A\u0635\u0627\u0644\u064A\xBB \u0644\u0625\u0631\u0633\u0627\u0644 \u0631\u0642\u0645\u0643 \u0623\u0646\u062A.",
      CONTACT_KEYBOARD
    );
    return;
  }
  const phone = msg.contact.phone_number;
  const normalized = normalizePhone(phone);
  const tail = normalized.slice(-8);
  const guardians = await prisma.guardianProfile.findMany({
    where: { phone: { not: null } },
    include: { user: true }
  });
  const g = guardians.find(
    (x) => x.phone && normalizePhone(x.phone).endsWith(tail)
  );
  if (g) {
    await prisma.user.update({
      where: { id: g.userId },
      data: { telegramChatId: String(msg.chat.id) }
    });
    await api.sendMessage(
      msg.chat.id,
      `\u062A\u0645 \u0631\u0628\u0637 \u062D\u0633\u0627\u0628\u0643 \u0628\u0646\u062C\u0627\u062D \u064A\u0627 ${g.user.name}. \u0633\u062A\u0635\u0644\u0643 \u062A\u0642\u0627\u0631\u064A\u0631 \u0623\u0628\u0646\u0627\u0626\u0643 \u0647\u0646\u0627.`
    );
    return;
  }
  const staff = await prisma.user.findMany({
    where: { phone: { not: null }, isActive: true, role: { in: ["teacher", "admin"] } }
  });
  const u = staff.find((x) => x.phone && normalizePhone(x.phone).endsWith(tail));
  if (u) {
    await prisma.user.update({
      where: { id: u.id },
      data: { telegramChatId: String(msg.chat.id) }
    });
    await api.sendMessage(
      msg.chat.id,
      `\u062A\u0645 \u0631\u0628\u0637 \u062D\u0633\u0627\u0628\u0643 \u064A\u0627 ${u.name} (${u.role === "admin" ? "\u0625\u062F\u0627\u0631\u0629" : "\u0645\u0639\u0644\u0645"}).
\u0623\u0631\u0633\u0644 \xAB\u062D\u0636\u0648\u0631\xBB \u0623\u0648 \xAB\u0633\u0644\u0648\u0643\xBB \u0644\u0631\u0635\u062F \u062D\u0635\u0635\u0643\u060C \u0623\u0648 \u0627\u0633\u0645 \u0637\u0627\u0644\u0628 \u0644\u062A\u0642\u0631\u064A\u0631\u0647.`
    );
    return;
  }
  const students = await prisma.student.findMany({
    where: { guardianPhone: { not: null }, isActive: true },
    select: { id: true, fullName: true, guardianPhone: true, guardianName: true }
  });
  const matched = students.filter(
    (s2) => s2.guardianPhone && normalizePhone(s2.guardianPhone).endsWith(tail)
  );
  if (matched.length) {
    const displayName = matched.find((s2) => s2.guardianName && s2.guardianName !== "\u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631")?.guardianName ?? `\u0648\u0644\u064A \u0623\u0645\u0631 ${matched[0].fullName.split(" ").slice(0, 2).join(" ")}`;
    const chatTaken = await prisma.user.findFirst({
      where: { telegramChatId: String(msg.chat.id) },
      select: { id: true, role: true }
    });
    const account = await createGuardianAccount({
      displayName,
      phone: msg.contact.phone_number,
      password: generatePassword(),
      // ضمنية — دخول البوابة لاحقاً عبر ضبط كلمة مرور
      telegramChatId: chatTaken ? void 0 : String(msg.chat.id)
    });
    for (const s2 of matched) {
      await prisma.guardianStudent.upsert({
        where: { guardianId_studentId: { guardianId: account.guardianId, studentId: s2.id } },
        create: { guardianId: account.guardianId, studentId: s2.id, verified: true },
        update: { verified: true }
      });
    }
    const kids = matched.map((s2) => `\u2022 ${s2.fullName}`).join("\n");
    await api.sendMessage(
      msg.chat.id,
      `\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u064A\u0627 ${displayName}.
\u062A\u0645 \u0631\u0628\u0637 \u062D\u0633\u0627\u0628\u0643 \u0628\u0623\u0628\u0646\u0627\u0626\u0643 (${matched.length}):
${kids}
` + (chatTaken ? "\u0645\u0644\u0627\u062D\u0638\u0629: \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u062D\u0633\u0627\u0628 \u0622\u062E\u0631\u060C \u0641\u0644\u0646 \u062A\u0635\u0644\u0643 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u0647\u0646\u0627 \u2014 \u0631\u0627\u062C\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0623\u0648 \u0627\u0633\u062A\u062E\u062F\u0645 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645\u0627\u064B \u0622\u062E\u0631." : "\u0633\u062A\u0635\u0644\u0643 \u062A\u0642\u0627\u0631\u064A\u0631\u0647\u0645 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u0647\u0646\u0627. \u0623\u0631\u0633\u0644 \u0627\u0633\u0645 \u0627\u0628\u0646\u0643 \u0644\u0637\u0644\u0628 \u062A\u0642\u0631\u064A\u0631 \u0641\u0648\u0631\u064A.")
    );
    return;
  }
  await api.sendMessage(
    msg.chat.id,
    "\u0644\u0645 \u064A\u064F\u0639\u062B\u0631 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645 \u0641\u064A \u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u062F\u0631\u0633\u0629. \u0631\u0627\u062C\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0644\u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A\u0643."
  );
}
var SYSTEM_ACTOR2, CONTACT_KEYBOARD;
var init_telegramInbox = __esm({
  "src/lib/jobs/telegramInbox.ts"() {
    "use strict";
    init_src();
    init_src2();
    init_src3();
    init_telegram();
    init_teacherBot();
    SYSTEM_ACTOR2 = { userId: "system", role: "admin", isActive: true };
    CONTACT_KEYBOARD = {
      reply_markup: {
        keyboard: [[{ text: "\u{1F4F1} \u0645\u0634\u0627\u0631\u0643\u0629 \u062C\u0647\u0629 \u0627\u062A\u0635\u0627\u0644\u064A", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
  }
});

// src/lib/jobs/drain.ts
var drain_exports = {};
__export(drain_exports, {
  drainOutbox: () => drainOutbox,
  drainTelegramInbox: () => drainTelegramInbox
});
async function drainOutbox(limit = 25) {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: "pending", nextAttemptAt: { lte: /* @__PURE__ */ new Date() } },
    select: { id: true, type: true },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  let done2 = 0;
  for (const e of pending) {
    try {
      if (e.type === "report_send") await sendReportJob(e.id);
      else if (e.type === "absence_alert") await sendAlertJob(e.id);
      else if (e.type === "weekly_digest") await sendDigestJob(e.id);
      else if (e.type === "plan_notify") await sendPlanJob(e.id);
      else continue;
      done2++;
    } catch (err) {
      console.error(`[drain] \u0641\u0634\u0644 \u062D\u062F\u062B ${e.id} (${e.type}):`, err instanceof Error ? err.message : err);
    }
  }
  return done2;
}
async function drainTelegramInbox(limit = 25) {
  const staleBefore = new Date(Date.now() - 10 * 6e4);
  const pending = await prisma.telegramUpdateInbox.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "processing", createdAt: { lt: staleBefore } }
      ]
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  await prisma.telegramUpdateInbox.updateMany({
    where: { status: "processing", createdAt: { lt: staleBefore } },
    data: { status: "pending" }
  });
  let done2 = 0;
  for (const u of pending) {
    try {
      await processTelegramUpdate(u.id);
      done2++;
    } catch (err) {
      console.error(`[drain] \u0641\u0634\u0644 \u062A\u062D\u062F\u064A\u062B ${u.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return done2;
}
var init_drain = __esm({
  "src/lib/jobs/drain.ts"() {
    "use strict";
    init_src();
    init_reportSend();
    init_alertSend();
    init_digestSend();
    init_planSend();
    init_telegramInbox();
  }
});

// scripts/test-plan-send.tsx
import fs from "node:fs";
import path2 from "node:path";
var env = fs.readFileSync(path2.join(process.cwd(), ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+?)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && m[1]) process.env[m[1]] = m[2];
}
var { prisma: prisma2 } = await Promise.resolve().then(() => (init_src(), src_exports));
var { publishClassPlan: publishClassPlan2, weekStartOf: weekStartOf2 } = await Promise.resolve().then(() => (init_src2(), src_exports2));
var { drainOutbox: drainOutbox2 } = await Promise.resolve().then(() => (init_drain(), drain_exports));
var CHAT_ID = "5813379883";
var year = await prisma2.academicYear.findFirst({ where: { isCurrent: true } });
var cls = await prisma2.classGroup.findFirst({
  where: { academicYearId: year?.id, isActive: true }
});
var student = await prisma2.student.findFirst({
  where: { isActive: true, enrollments: { some: { classId: cls.id } } }
});
if (!cls || !student || !year) throw new Error("\u0644\u0627 \u0635\u0641/\u0637\u0627\u0644\u0628/\u0639\u0627\u0645 \u0641\u064A \u0627\u0644\u0642\u0627\u0639\u062F\u0629");
var gUser = await prisma2.user.findFirst({ where: { telegramChatId: CHAT_ID } });
if (!gUser) throw new Error(`\u0644\u0627 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 ${CHAT_ID}`);
var profile = await prisma2.guardianProfile.findUnique({ where: { userId: gUser.id } });
if (!profile) profile = await prisma2.guardianProfile.create({ data: { userId: gUser.id } });
await prisma2.guardianStudent.upsert({
  where: { guardianId_studentId: { guardianId: profile.id, studentId: student.id } },
  create: { guardianId: profile.id, studentId: student.id, verified: true },
  update: { verified: true }
});
console.log("guardian:", gUser.id, "\u2192 student:", student.fullName);
var asg = await prisma2.teachingAssignment.findFirst({
  where: { classId: cls.id, academicYearId: year.id, isActive: true }
});
if (!asg) throw new Error("\u0644\u0627 \u0625\u0633\u0646\u0627\u062F \u0644\u0644\u0635\u0641");
var weekStart = weekStartOf2(/* @__PURE__ */ new Date());
var plan = await prisma2.weeklyPlan.upsert({
  where: {
    teacherId_classId_subjectId_weekStart: {
      teacherId: asg.teacherId,
      classId: cls.id,
      subjectId: asg.subjectId,
      weekStart
    }
  },
  create: {
    teacherId: asg.teacherId,
    classId: cls.id,
    subjectId: asg.subjectId,
    weekStart,
    status: "submitted",
    submittedAt: /* @__PURE__ */ new Date(),
    entries: {
      create: [
        { weekday: 0, lessonTitle: "\u0627\u0644\u062C\u0645\u0639 \u0648\u0627\u0644\u0637\u0631\u062D", textbook: "\u0635 10-12", tests: "\u2014" },
        { weekday: 1, lessonTitle: "\u0627\u0644\u0636\u0631\u0628", textbook: "\u0635 13-15", platforms: "\u062A\u0645\u0631\u064A\u0646 2", tests: "\u0627\u062E\u062A\u0628\u0627\u0631 \u0642\u0635\u064A\u0631" },
        { weekday: 2, lessonTitle: "\u0627\u0644\u0642\u0633\u0645\u0629", textbook: "\u0635 16-18", notes: "\u0648\u0627\u062C\u0628 \u0645\u0646\u0632\u0644\u064A" }
      ]
    }
  },
  update: { status: "submitted", submittedAt: /* @__PURE__ */ new Date() }
});
console.log("plan:", plan.id, "submitted for", cls.displayName, "week", weekStart.toISOString().slice(0, 10));
var admin = await prisma2.user.findFirst({ where: { username: "admin" } });
var res = await publishClassPlan2(
  { userId: admin.id, role: "admin", isActive: true },
  { classId: cls.id, weekStart }
);
console.log("published:", JSON.stringify(res));
var done = await drainOutbox2(10);
console.log("drained:", done);
await prisma2.$disconnect();
/*! Bundled license information:

react/cjs/react-jsx-runtime.production.js:
  (**
   * @license React
   * react-jsx-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.development.js:
  (**
   * @license React
   * react-jsx-runtime.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/

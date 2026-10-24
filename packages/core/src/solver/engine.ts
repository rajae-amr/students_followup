/**
 * طبقة التكامل بين محرك الجدولة وقاعدة بيانات تطبيق المتابعة.
 * sectionId في طبقة المحرك = classId في مخططنا؛ teacherId = User.id.
 */
import { prisma } from "@app/db";
import { runSolver } from "./runner";
import { validateTimetable } from "./conflicts";
import { dayName } from "./util";
import {
  mergeConstraints,
  type SolverInput,
} from "./types";

export { runSolver } from "./runner";
export { preSolveChecks } from "./diagnostics";
export * from "./types";

export type Slot = { dayOfWeek: number; periodIndex: number };

export type ScheduleConfig = {
  workingDays: number[];                 // مرتبة تصاعديًا
  lessonPeriodsPerDay: Map<number, number[]>; // اليوم → فهارس الحصص فقط (بلا استراحات)
  slots: Slot[];                          // كل الخانات القابلة للتدريس
  // تحويل فهرس الخانة (DayPeriodDef.index) → رقم الحصة التسلسلي في اليوم (TimetableSlot.period)
  periodNumberOf: (dayOfWeek: number, periodIndex: number) => number;
};

/** يحمّل إعداد الشبكة الزمنية: أيام الدوام + خارطة الفترات لكل يوم */
export async function loadScheduleConfig(): Promise<ScheduleConfig> {
  const s = await prisma.schoolSettings.findUnique({ where: { id: "school" } });
  const workingDays = (s?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort((a, b) => a - b);
  const defs = await prisma.dayPeriodDef.findMany({ orderBy: [{ dayOfWeek: "asc" }, { index: "asc" }] });

  const lessonPeriodsPerDay = new Map<number, number[]>();
  const periodNum = new Map<string, number>();
  const slots: Slot[] = [];

  if (defs.length > 0) {
    // تعريفات لكل يوم على حدة — الفهرس يشمل الاستراحات، ورقم الحصة يتسلسل بين غيرها
    for (const day of workingDays) {
      const lessons = defs.filter((d) => d.dayOfWeek === day && !d.isBreak).map((d) => d.index);
      lessonPeriodsPerDay.set(day, lessons);
      lessons.forEach((idx, i) => periodNum.set(`${day}-${idx}`, i + 1));
      for (const idx of lessons) slots.push({ dayOfWeek: day, periodIndex: idx });
    }
  } else {
    // بدون تعريفات: ترقيم تسلسلي 1..periodsPerDay لكل يوم
    const n = s?.periodsPerDay ?? 8;
    for (const day of workingDays) {
      const lessons = Array.from({ length: n }, (_, i) => i + 1);
      lessonPeriodsPerDay.set(day, lessons);
      lessons.forEach((idx, i) => periodNum.set(`${day}-${idx}`, i + 1));
      for (const idx of lessons) slots.push({ dayOfWeek: day, periodIndex: idx });
    }
  }

  return {
    workingDays,
    lessonPeriodsPerDay,
    slots,
    periodNumberOf: (d, p) => periodNum.get(`${d}-${p}`) ?? p,
  };
}

/** يحمّل كل ما يحتاجه المحرك من قاعدة البيانات لعام دراسي */
export async function buildSolverInput(
  academicYearId: string,
  timeLimitSeconds = 60
): Promise<SolverInput> {
  const config = await loadScheduleConfig();

  const [settings, assignments, teachers, subjects, classes, unavailRows, subjectBlockRows, quotas] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    prisma.teachingAssignment.findMany({
      where: { academicYearId, isActive: true },
      include: { class: true, subject: true },
    }),
    prisma.teacherProfile.findMany({ include: { user: { select: { id: true, name: true, isActive: true } } } }),
    prisma.subject.findMany({ where: { isActive: true } }),
    prisma.classGroup.findMany({ where: { academicYearId, isActive: true } }),
    prisma.teacherAvailability.findMany(),
    prisma.subjectUnavailability.findMany(),
    prisma.subjectGradeQuota.findMany(),
  ]);

  const teacherIds = new Set(teachers.filter((t) => t.user.isActive).map((t) => t.userId));

  const unavailable = new Map<string, Set<`${number}-${number}`>>();
  for (const u of unavailRows) {
    if (!unavailable.has(u.teacherId)) unavailable.set(u.teacherId, new Set());
    unavailable.get(u.teacherId)!.add(`${u.dayOfWeek}-${u.periodIndex}`);
  }
  const subjectBlocked = new Map<string, Set<`${number}-${number}`>>();
  for (const u of subjectBlockRows) {
    if (!subjectBlocked.has(u.subjectId)) subjectBlocked.set(u.subjectId, new Set());
    subjectBlocked.get(u.subjectId)!.add(`${u.dayOfWeek}-${u.periodIndex}`);
  }

  // نصاب (مادة، مستوى صف) — يُشتق منه عدد حصص كل إسناد
  const quotaOf = new Map(quotas.map((q) => [`${q.subjectId}|${q.gradeId}`, q.weeklyPeriods] as const));
  const gradeOfClass = new Map(classes.map((c) => [c.id, c.gradeId] as const));
  const weeklyPeriodsOf = (a: { subjectId: string; classId: string }) =>
    quotaOf.get(`${a.subjectId}|${gradeOfClass.get(a.classId)}`) ?? 0;

  const constraints = mergeConstraints(settings?.constraintsJson);
  // الحد العام يطبق على كل المعلمين، والقيمة الشخصية على الملف تتقدّم عليه
  const globalMaxDaily = constraints.teacherMaxDaily.value ?? 0;
  const globalMaxConsec = constraints.teacherMaxConsec.value ?? 0;
  const teacherMaxDaily = new Map<string, number>();
  const teacherMaxConsec = new Map<string, number>();
  for (const t of teachers) {
    const daily = t.maxDailyLessons ?? (globalMaxDaily > 0 ? globalMaxDaily : null);
    if (daily != null && daily > 0) teacherMaxDaily.set(t.userId, daily);
    const consec = t.maxConsecutive ?? (globalMaxConsec > 0 ? globalMaxConsec : null);
    if (consec != null && consec > 0) teacherMaxConsec.set(t.userId, consec);
  }

  return {
    workingDays: config.workingDays,
    periodsPerDay: config.lessonPeriodsPerDay,
    assignments: assignments
      .filter((a) => teacherIds.has(a.teacherId))
      .map((a) => ({
        id: a.id,
        teacherId: a.teacherId,
        sectionId: a.classId,
        subjectId: a.subjectId,
        weeklyPeriods: weeklyPeriodsOf(a),
      })),
    unavailable,
    teacherMaxDaily,
    teacherMaxConsec,
    subjectPreferEarly: new Set(subjects.filter((s) => s.preferEarly).map((s) => s.id)),
    subjectBlocked,
    subjectMaxPerDay: new Map(
      subjects.filter((s) => s.maxPerDay != null).map((s) => [s.id, s.maxPerDay!])
    ),
    subjectMinDays: new Map(
      subjects.filter((s) => s.minDaysPerWeek != null).map((s) => [s.id, s.minDaysPerWeek!])
    ),
    teacherNames: new Map(teachers.map((t) => [t.userId, t.user.name])),
    sectionNames: new Map(classes.map((c) => [c.id, c.displayName])),
    subjectNames: new Map(subjects.map((s) => [s.id, s.name])),
    constraints,
    timeLimitSeconds,
  };
}

/**
 * ينفّذ دورة توليد كاملة لوظيفة TimetableJob:
 * يبني المدخلات، يحل، يتحقق مستقلًا، يحفظ النتائج كمسودة جدول.
 */
export async function executeGenerationJob(jobId: string, academicYearId: string): Promise<void> {
  const log: string[] = [];

  const update = async (data: Record<string, unknown>) =>
    prisma.timetableJob.update({ where: { id: jobId }, data });

  try {
    await update({ status: "RUNNING" });
    log.push("تحميل البيانات…");

    const input = await buildSolverInput(academicYearId);
    log.push(
      `تم تحميل ${new Set(input.assignments.map((a) => a.teacherId)).size} معلمًا و` +
      `${new Set(input.assignments.map((a) => a.sectionId)).size} شعبة و` +
      `${input.assignments.length} تكليفًا`
    );

    const { result, diagnostics } = await runSolver(input);
    log.push(`انتهى الحل خلال ${(result.solveTimeMs / 1000).toFixed(1)} ثانية — الحالة: ${result.status}`);

    if (result.status !== "OPTIMAL" && result.status !== "FEASIBLE") {
      await update({
        status: "INFEASIBLE",
        logJson: JSON.stringify(log),
        diagnosticsJson: JSON.stringify(diagnostics),
        finishedAt: new Date(),
      });
      return;
    }

    // تحقق مستقل — يجب ألا توجد تعارضات صلبة أبدًا
    const aById = new Map(input.assignments.map((a) => [a.id, a]));
    const entries = result.placements.map((p) => ({
      assignmentId: p.assignmentId,
      teacherId: aById.get(p.assignmentId)!.teacherId,
      sectionId: aById.get(p.assignmentId)!.sectionId,
      dayOfWeek: p.dayOfWeek,
      periodIndex: p.periodIndex,
    }));
    const violations = validateTimetable(input, entries);
    const hardCount = violations.filter((v) => v.severity === "error").length;
    log.push(
      hardCount === 0
        ? "✓ التحقق المستقل: لا توجد تعارضات أساسية"
        : `⚠ التحقق المستقل وجد ${hardCount} تعارضًا!`
    );

    const timetable = await prisma.generatedTimetable.create({
      data: {
        name: `جدول ${new Date().toLocaleDateString("ar")}`,
        status: "DRAFT",
        qualityScore: result.score,
        statsJson: JSON.stringify({
          violations: result.violations,
          validationViolations: violations,
          solveTimeMs: result.solveTimeMs,
          placed: result.placements.length,
          total: input.assignments.reduce((s, a) => s + a.weeklyPeriods, 0),
        }),
      },
    });
    await prisma.generatedTimetableEntry.createMany({
      data: result.placements.map((p) => ({
        timetableId: timetable.id,
        dayOfWeek: p.dayOfWeek,
        periodIndex: p.periodIndex,
        assignmentId: p.assignmentId,
      })),
    });

    await update({
      status: "DONE",
      logJson: JSON.stringify(log),
      diagnosticsJson: JSON.stringify(diagnostics),
      timetableId: timetable.id,
      finishedAt: new Date(),
    });
  } catch (e) {
    await update({
      status: "FAILED",
      error: e instanceof Error ? e.message : String(e),
      finishedAt: new Date(),
    });
    throw e;
  }
}

/**
 * ينشر مسودة جدول مولّد: يحوّل خاناته إلى TimetableSlot فعلية ويُنهي
 * صلاحية الخانات الحالية (effectiveTo) دون حذفها — السجلات التاريخية تبقى.
 */
export async function publishGeneratedTimetable(
  timetableId: string,
  effectiveFrom: Date
): Promise<{ slots: number; ended: number }> {
  const config = await loadScheduleConfig();
  const timetable = await prisma.generatedTimetable.findUniqueOrThrow({
    where: { id: timetableId },
    include: {
      entries: {
        include: { assignment: true },
      },
    },
  });

  const day0 = new Date(Date.UTC(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), effectiveFrom.getDate()));
  const endDay = new Date(day0.getTime() - 24 * 3600 * 1000);

  return prisma.$transaction(async (tx) => {
    // إنهاء صلاحية الخانات السارية الحالية
    const ended = await tx.timetableSlot.updateMany({
      where: { effectiveTo: null },
      data: { effectiveTo: endDay },
    });

    const maxV = await tx.timetableSlot.aggregate({ _max: { version: true } });
    const version = (maxV._max.version ?? 0) + 1;

    const data = timetable.entries.map((e) => ({
      assignmentId: e.assignmentId,
      teacherId: e.assignment.teacherId,
      classId: e.assignment.classId,
      subjectId: e.assignment.subjectId,
      weekday: e.dayOfWeek,
      period: config.periodNumberOf(e.dayOfWeek, e.periodIndex),
      effectiveFrom: day0,
      version,
    }));
    await tx.timetableSlot.createMany({ data });

    await tx.generatedTimetable.updateMany({
      where: { status: "PUBLISHED" },
      data: { status: "ARCHIVED" },
    });
    await tx.generatedTimetable.update({
      where: { id: timetableId },
      data: { status: "PUBLISHED" },
    });

    return { slots: data.length, ended: ended.count };
  });
}

/**
 * يفحص الجدول الساري (TimetableSlot الفعّالة) بالمتحقق المستقل —
 * يشمل خانات المولّد والتعديلات اليدوية (assignmentId=null → معرّف اصطناعي).
 * يحوّل رقم الحصة التسلسلي إلى فهرس الخانة الأصلي لكل يوم.
 */
export async function validatePublishedTimetable(academicYearId: string): Promise<{
  violations: import("./conflicts").Violation[];
  slotCount: number;
  expected: number;
}> {
  const input = await buildSolverInput(academicYearId);
  const slots = await prisma.timetableSlot.findMany({
    where: { effectiveTo: null, class: { academicYearId } },
  });
  const entries = slots.map((s) => ({
    assignmentId: s.assignmentId ?? `manual|${s.id}`,
    teacherId: s.teacherId,
    sectionId: s.classId,
    dayOfWeek: s.weekday,
    periodIndex: (input.periodsPerDay.get(s.weekday) ?? [])[s.period - 1] ?? s.period,
  }));
  return {
    violations: validateTimetable(input, entries),
    slotCount: slots.length,
    expected: input.assignments.reduce((s, a) => s + a.weeklyPeriods, 0),
  };
}

export function slotLabel(day: number, periodIndex: number, periodsPerDay: Map<number, number[]>): string {
  const pos = (periodsPerDay.get(day) ?? []).indexOf(periodIndex);
  return `${dayName(day)} — الحصة ${pos >= 0 ? pos + 1 : periodIndex + 1}`;
}

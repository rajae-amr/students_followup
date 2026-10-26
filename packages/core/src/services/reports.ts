/**
 * خدمة التقرير المدرسي الموحد — تقرير واحد لكل طالب يجمع كل المواد والمعلمين.
 * الإدارة تعتمد وترسل؛ المعلم يعاين نطاقه فقط.
 * اللقطة (snapshot) ثابتة: تعديل المصدر لاحقاً لا يغيّر ما أُرسل.
 */

import { prisma, Prisma } from "@app/db";
import {
  ForbiddenError,
  NotFoundError,
  requireActive,
  requireAdmin,
} from "../permissions";
import type { Actor } from "../permissions";
import { DAY_STATUS_AR, LESSON_STATUS_AR } from "../attendance/derive";
import { StateError } from "../attendance/service";
import { academicStats, parseGradeWeights } from "./grades";

export interface StudentReportContent {
  student: { id: string; name: string; className: string | null };
  range: { start: string; end: string };
  attendance: {
    daysRecorded: number;
    absent: number;
    excused: number;
    partial: number;
    late: number;
    present: number;
    lessonEntries: {
      date: string;
      period: number;
      subject: string;
      status: string;
      statusAr: string;
    }[];
  };
  grades: {
    subject: string;
    teacher: string;
    assessments: { title: string; kind: string; date: string; score: number | null; status: string; max: number }[];
  }[];
  evaluations: { subject: string; teacher: string; category: string; value: string }[];
  behavior: { date: string; teacher: string; category: string | null; text: string | null }[];
  generatedAt: string;
  policyVersion: number;
}

/** يجمع محتوى التقرير — مصدر واحد للمعاينة واللقطة والإرسال */
export async function buildStudentReport(
  actor: Actor,
  input: { studentId: string; rangeStart: Date; rangeEnd: Date },
): Promise<StudentReportContent> {
  requireActive(actor);

  // ولي الأمر: طلابه الموثقون فقط — المعلم: نطاق تدريسه — الإدارة: الكل
  if (actor.role === "guardian") {
    const profile = await prisma.guardianProfile.findUnique({
      where: { userId: actor.userId },
    });
    const link = profile
      ? await prisma.guardianStudent.findUnique({
          where: {
            guardianId_studentId: {
              guardianId: profile.id,
              studentId: input.studentId,
            },
          },
        })
      : null;
    if (!link?.verified) throw new ForbiddenError();
  } else if (actor.role === "teacher") {
    const year = await prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    const allowed = year
      ? await prisma.enrollment.findFirst({
          where: {
            studentId: input.studentId,
            academicYearId: year.id,
            class: {
              assignments: {
                some: { teacherId: actor.userId, isActive: true },
              },
            },
          },
        })
      : null;
    if (!allowed) throw new ForbiddenError("الطالب خارج نطاق تدريسك");
  }

  const { studentId, rangeStart, rangeEnd } = input;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        include: { class: { select: { displayName: true } } },
        take: 1,
      },
    },
  });
  if (!student) throw new NotFoundError("الطالب غير موجود");

  const settings = await prisma.schoolSettings.findUnique({
    where: { id: "school" },
  });

  const [summaries, entries, grades, evaluations, behavior] = await Promise.all([
    prisma.dailySummary.findMany({
      where: { studentId, date: { gte: rangeStart, lte: rangeEnd } },
    }),
    prisma.attendanceEntry.findMany({
      where: {
        studentId,
        status: { not: "present" }, // الاستثناءات فقط — التقرير للمتابعة
        lessonSession: { date: { gte: rangeStart, lte: rangeEnd } },
      },
      include: {
        lessonSession: { include: { subject: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.grade.findMany({
      where: {
        studentId,
        // المنشور فقط — المسودات مرحلة عمل داخلية للمعلم
        assessment: { publishedAt: { not: null }, date: { gte: rangeStart, lte: rangeEnd } },
      },
      include: {
        assessment: {
          include: {
            subject: { select: { name: true, id: true, gradeWeights: true } },
          },
        },
      },
    }),
    prisma.evaluation.findMany({
      where: {
        studentId,
        // التقييمات أسبوعية — نأخذ أسابيع ضمن نطاق التقرير فقط
        weekStart: { gte: rangeStart, lte: rangeEnd },
      },
      include: {
        subject: { select: { name: true } },
      },
    }),
    prisma.behaviorEntry.findMany({
      where: {
        studentId,
        date: { gte: rangeStart, lte: rangeEnd },
        // ولي الأمر يرى المنشور للأسرة فقط
        ...(actor.role === "guardian" ? { audience: "family" as const } : {}),
      },
    }),
  ]);

  const teacherIds = [
    ...new Set([
      ...grades.map((g) => g.assessment.teacherId),
      ...evaluations.map((e) => e.teacherId),
      ...behavior.map((b) => b.teacherId),
    ]),
  ];
  const teachers = await prisma.user.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, name: true },
  });
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));

  const byStatus = { absent: 0, excused: 0, partial: 0, late: 0, present: 0 };
  for (const s of summaries) {
    if (s.status === "absent") byStatus.absent++;
    else if (s.status === "excused") byStatus.excused++;
    else if (s.status === "partial") byStatus.partial++;
    else if (s.status === "late") byStatus.late++;
    else if (s.status === "present") byStatus.present++;
  }

  // أوزان المواد — تُقرأ مرة لكل تقرير وتُمرّر للإحصاء الموزون
  const subjectWeights = new Map<string, unknown>();
  for (const g of grades) subjectWeights.set(g.assessment.subjectId, g.assessment.subject.gradeWeights);

  // تجميع الدرجات بحسب (المادة + المعلم) — لا دمج بين معلمين
  const gradeGroups = new Map<string, StudentReportContent["grades"][number] & { subjectId: string }>();
  for (const g of grades) {
    const key = `${g.assessment.subjectId}:${g.assessment.teacherId}`;
    let group = gradeGroups.get(key);
    if (!group) {
      group = {
        subjectId: g.assessment.subjectId,
        subject: g.assessment.subject.name,
        teacher: teacherName.get(g.assessment.teacherId) ?? "غير موثق",
        assessments: [],
      };
      gradeGroups.set(key, group);
    }
    group.assessments.push({
      title: g.assessment.title,
      kind: g.assessment.kind,
      date: g.assessment.date.toISOString().slice(0, 10),
      score: g.score,
      status: g.status,
      max: g.assessment.maxScore,
    });
  }

  // بنود التقييم المحسوبة آلياً لكل مادة: الدرجة الأكاديمية (نسبة) والتقدير (حرف)
  // — من اختبارات الفترة (اختبار + اختبار قصير)؛ تُغفل إن لم توجد درجات
  const autoEvals: StudentReportContent["evaluations"] = [];
  for (const group of gradeGroups.values()) {
    const stats = academicStats(
      group.assessments.map((a) => ({ score: a.score, max: a.max, kind: a.kind, status: a.status })),
      parseGradeWeights(subjectWeights.get(group.subjectId ?? "")),
    );
    if (!stats) continue;
    autoEvals.push(
      {
        subject: group.subject,
        teacher: group.teacher,
        category: "الدرجة الأكاديمية",
        value: `${stats.pct}%`,
      },
      { subject: group.subject, teacher: group.teacher, category: "التقدير", value: stats.letter },
    );
  }

  return {
    student: {
      id: student.id,
      name: student.fullName,
      className: student.enrollments[0]?.class.displayName ?? null,
    },
    range: {
      start: rangeStart.toISOString().slice(0, 10),
      end: rangeEnd.toISOString().slice(0, 10),
    },
    attendance: {
      daysRecorded: summaries.length,
      ...byStatus,
      lessonEntries: entries.map((e) => ({
        date: e.lessonSession.date.toISOString().slice(0, 10),
        period: e.lessonSession.period,
        subject: e.lessonSession.subject.name,
        status: e.status,
        statusAr: LESSON_STATUS_AR[e.status],
      })),
    },
    grades: [...gradeGroups.values()],
    evaluations: [
      ...autoEvals,
      ...evaluations.map((e) => ({
        subject: e.subject?.name ?? "عام",
        teacher: teacherName.get(e.teacherId) ?? "غير موثق",
        category: e.category,
        value: e.value,
      })),
    ],
    behavior: behavior.map((b) => ({
      date: b.date.toISOString().slice(0, 10),
      teacher: teacherName.get(b.teacherId) ?? "غير موثق",
      category: b.category,
      text: b.text,
    })),
    generatedAt: new Date().toISOString(),
    policyVersion: settings?.policyVersion ?? 1,
  };
}

/** إنشاء لقطة تقرير معتمدة — الإدارة فقط */
export async function createReportSnapshot(
  actor: Actor,
  input: {
    studentId: string;
    rangeStart: Date;
    rangeEnd: Date;
    termId?: string;
  },
) {
  requireAdmin(actor);
  const content = await buildStudentReport(actor, input);

  return prisma.reportSnapshot.create({
    data: {
      studentId: input.studentId,
      termId: input.termId ?? null,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      contentJson: content as unknown as Prisma.InputJsonValue,
      status: "approved",
      approvedById: actor.userId,
      approvedAt: new Date(),
    },
  });
}

/**
 * طلب إرسال تقرير لأولياء أمور الطالب — يسجّل Outbox لكل قناة.
 * العامل الخلفي يتولى الإرسال الفعلي مع تتبع المحاولات.
 */
export async function queueReportDelivery(
  actor: Actor,
  input: { reportSnapshotId: string },
) {
  requireAdmin(actor);
  const report = await prisma.reportSnapshot.findUnique({
    where: { id: input.reportSnapshotId },
  });
  if (!report) throw new NotFoundError("التقرير غير موجود");
  if (report.status !== "approved")
    throw new StateError("التقرير غير معتمد بعد");

  const guardians = await prisma.guardianStudent.findMany({
    // canViewReports=false يمنع الإرسال أيضاً — لا حصر على العرض فقط
    where: { studentId: report.studentId, verified: true, canViewReports: true },
    include: {
      guardian: {
        include: { user: { select: { telegramChatId: true, isActive: true } } },
      },
    },
  });

  const queued: string[] = [];
  for (const g of guardians) {
    const chatId = g.guardian.user.telegramChatId;
    // قناة تيليجرام تتطلب ربطاً — بلا ربط نسقط للبوابة بدل تخطي الولي كلياً
    const channel =
      g.guardian.preferredChannel === "telegram" && !chatId
        ? "portal"
        : g.guardian.preferredChannel;
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
          telegramChatId: chatId,
        },
      },
      update: {}, // idempotent — لا إعادة إدراج
    });
    queued.push(g.guardianId);
  }

  await prisma.auditEvent.create({
    data: {
      actorId: actor.userId,
      action: "report.queue",
      entityType: "ReportSnapshot",
      entityId: report.id,
      after: { guardians: queued.length },
    },
  });
  return { queued: queued.length };
}

/**
 * خدمة الدرجات والتقييمات.
 * هوية التقييم تشمل المعلم والمادة — لا دمج بين مادتين بنفس العنوان والتاريخ.
 */

import { prisma } from "@app/db";
import {
  ForbiddenError,
  NotFoundError,
  requireTeacher,
} from "../permissions";
import type { Actor } from "../permissions";
import { StateError } from "../attendance/service";

export type AssessmentKind = "quiz" | "homework" | "exam" | "participation";

async function currentYearId(): Promise<string> {
  const y = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  if (!y) throw new StateError("لا يوجد عام دراسي حالي");
  return y.id;
}

/** يتحقق أن المعلم مسند فعلاً للصف/المادة — يُعاد الفحص عند كل كتابة */
async function assertAssignment(
  actor: Actor,
  classId: string,
  subjectId: string,
) {
  if (actor.role === "admin") return;
  const yearId = await currentYearId();
  const a = await prisma.teachingAssignment.findFirst({
    where: {
      teacherId: actor.userId,
      classId,
      subjectId,
      academicYearId: yearId,
      isActive: true,
    },
  });
  if (!a) throw new ForbiddenError("هذا الصف/المادة خارج إسنادك");
}

export async function createAssessment(
  actor: Actor,
  input: {
    classId: string;
    subjectId: string;
    termId?: string;
    title: string;
    kind?: AssessmentKind;
    date: Date;
    maxScore: number;
  },
) {
  requireTeacher(actor);
  if (!input.title.trim()) throw new StateError("عنوان التقييم مطلوب");
  if (!(input.maxScore > 0)) throw new StateError("الدرجة العظمى يجب أن تكون > 0");
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
      maxScore: input.maxScore,
    },
  });
}

/** رصد درجة طالب — المعلم لا يرصد إلا في تقييمه هو */
export async function setGrade(
  actor: Actor,
  input: { assessmentId: string; studentId: string; score: number | null; note?: string },
) {
  requireTeacher(actor);
  const assessment = await prisma.assessment.findUnique({
    where: { id: input.assessmentId },
  });
  if (!assessment) throw new NotFoundError("التقييم غير موجود");
  if (actor.role === "teacher" && assessment.teacherId !== actor.userId)
    throw new ForbiddenError("تقييم معلم آخر — لا يمكنك تعديله");

  if (input.score !== null) {
    if (input.score < 0 || input.score > assessment.maxScore)
      throw new StateError(`الدرجة بين 0 و${assessment.maxScore}`);
  }

  // الطالب في صف التقييم
  const yearId = await currentYearId();
  const enrolled = await prisma.enrollment.findFirst({
    where: {
      studentId: input.studentId,
      classId: assessment.classId,
      academicYearId: yearId,
    },
  });
  if (!enrolled) throw new ForbiddenError("الطالب ليس في صف هذا التقييم");

  return prisma.grade.upsert({
    where: {
      assessmentId_studentId: {
        assessmentId: input.assessmentId,
        studentId: input.studentId,
      },
    },
    create: {
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      score: input.score,
      note: input.note?.trim() || null,
    },
    update: { score: input.score, note: input.note?.trim() || null },
  });
}

/** بنود التقييم الأسبوعي اليدوية — الدرجة الأكاديمية والتقدير محسوبان آلياً */
export const WEEKLY_EVAL_CATEGORIES = ["المشاركة", "كتاب أ", "الكتب"] as const;
export const AUTO_EVAL_CATEGORIES = ["الدرجة الأكاديمية", "التقدير"] as const;

/** خيارات كل بند — الخيار الأول هو القيمة الافتراضية (موحدة بين الويب والبوت) */
export const WEEKLY_EVAL_OPTIONS: Record<
  (typeof WEEKLY_EVAL_CATEGORIES)[number],
  readonly string[]
> = {
  "المشاركة": ["نشط", "نشط جزئياً", "غير نشط"],
  "كتاب أ": ["في الموعد", "متأخراً"],
  "الكتب": ["مهتم", "مهتم جزئياً", "غير مهتم"],
};

/** القيمة الافتراضية لبند أسبوعي — أول خيار */
export function defaultEvalValue(category: string): string {
  return (WEEKLY_EVAL_OPTIONS as Record<string, readonly string[]>)[category]?.[0] ?? "";
}

/** بداية الأسبوع الدراسي (الاثنين) لتاريخ معطى */
export function weekStartOf(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // الاثنين=0
  return d;
}

export type AppreciationLetter = "A" | "B" | "C" | "D" | "F";

export function letterFromPct(pct: number): AppreciationLetter {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

const APPRECIATION_KINDS = new Set(["exam", "quiz"]);

/**
 * يحسب الدرجة الأكاديمية (نسبة) والتقدير (حرف) من درجات الاختبارات
 * — متوسط النسب المئوية للاختبارات والاختبارات القصيرة فقط.
 * يعيد null إن لم توجد درجات مرصودة لهذه الأنواع في الفترة.
 */
export function academicStats(
  items: { score: number | null; max: number; kind: string }[],
): { pct: number; letter: AppreciationLetter } | null {
  const scored = items.filter(
    (i) => i.score != null && i.max > 0 && APPRECIATION_KINDS.has(i.kind),
  );
  if (!scored.length) return null;
  const pct =
    scored.reduce((sum, i) => sum + (i.score! / i.max) * 100, 0) / scored.length;
  return { pct: Math.round(pct * 10) / 10, letter: letterFromPct(pct) };
}

/** تقييم دوري لطالب — مفتاحه (معلم+مادة+طالب+أسبوع+بند) فلا يستبدل معلمٌ آخرَ */
export async function setEvaluation(
  actor: Actor,
  input: {
    studentId: string;
    subjectId: string;
    termId?: string;
    weekStart?: Date;
    category: string;
    value: string;
  },
) {
  requireTeacher(actor);
  if (!input.category.trim() || !input.value.trim())
    throw new StateError("البند والقيمة مطلوبان");
  if ((AUTO_EVAL_CATEGORIES as readonly string[]).includes(input.category.trim()))
    throw new StateError("هذا البند يُحسب آلياً من الدرجات — لا يُدخل يدوياً");

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
            isActive: true,
          },
        },
      },
    },
  });
  if (actor.role === "teacher" && !enrolled)
    throw new ForbiddenError("الطالب خارج نطاق تدريسك لهذه المادة");

  const existing = await prisma.evaluation.findFirst({
    where: {
      teacherId: actor.userId,
      subjectId: input.subjectId,
      studentId: input.studentId,
      termId: input.termId ?? null,
      weekStart: input.weekStart ?? null,
      category: input.category.trim(),
    },
  });
  if (existing) {
    return prisma.evaluation.update({
      where: { id: existing.id },
      data: { value: input.value.trim() },
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
      value: input.value.trim(),
    },
  });
}

/** تقييمات معلم لصف/مادة */
export async function assessmentsForTeacher(
  actor: Actor,
  filter: { classId?: string; subjectId?: string },
) {
  requireTeacher(actor);
  return prisma.assessment.findMany({
    where: {
      ...(actor.role === "teacher" ? { teacherId: actor.userId } : {}),
      ...(filter.classId ? { classId: filter.classId } : {}),
      ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
    },
    include: {
      class: { select: { displayName: true } },
      subject: { select: { name: true } },
      _count: { select: { grades: true } },
    },
    orderBy: { date: "desc" },
  });
}

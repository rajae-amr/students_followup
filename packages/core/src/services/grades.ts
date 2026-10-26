/**
 * خدمة الدرجات والتقييمات.
 * هوية التقييم تشمل المعلم والمادة — لا دمج بين مادتين بنفس العنوان والتاريخ.
 */

import { prisma } from "@app/db";
import type { Prisma } from "@prisma/client";
import {
  ForbiddenError,
  NotFoundError,
  requireTeacher,
} from "../permissions";
import type { Actor } from "../permissions";
import { StateError } from "../attendance/service";

export type AssessmentKind = "quiz" | "homework" | "exam" | "participation";

/** حالات الدرجة غير الرقمية — تُعرض كحرف وتُستثنى من المتوسطات */
export const GRADE_STATUSES = ["normal", "absent", "excused", "exempt"] as const;
export type GradeStatus = (typeof GRADE_STATUSES)[number];
export const GRADE_STATUS_AR: Record<GradeStatus, string> = {
  normal: "",
  absent: "غ",
  excused: "ع",
  exempt: "م",
};
export const GRADE_STATUS_LABEL: Record<GradeStatus, string> = {
  normal: "مرصودة",
  absent: "غائب",
  excused: "غائب بعذر",
  exempt: "معفى",
};

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
    /** نشر فوراً — المسودة لا تدخل التقارير ولا بوابة الأهل */
    publish?: boolean;
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
      publishedAt: input.publish ? new Date() : null,
    },
  });
}

/** يتحقق أن التقييم ملك المعلم (أو أنه مدير) — أساس عمليات التعديل والنشر */
async function assertOwnAssessment(actor: Actor, assessmentId: string) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
  });
  if (!assessment) throw new NotFoundError("التقييم غير موجود");
  if (actor.role === "teacher" && assessment.teacherId !== actor.userId)
    throw new ForbiddenError("تقييم معلم آخر — لا يمكنك تعديله");
  return assessment;
}

/** تعديل بيانات تقييم — العنوان والنوع والتاريخ والعظمى */
export async function updateAssessment(
  actor: Actor,
  input: {
    id: string;
    title?: string;
    kind?: AssessmentKind;
    date?: Date;
    maxScore?: number;
    termId?: string | null;
  },
) {
  requireTeacher(actor);
  await assertOwnAssessment(actor, input.id);
  const data: Prisma.AssessmentUpdateInput = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new StateError("عنوان التقييم مطلوب");
    data.title = input.title.trim();
  }
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.date) data.date = input.date;
  if (input.termId !== undefined)
    data.term = input.termId ? { connect: { id: input.termId } } : { disconnect: true };
  if (input.maxScore !== undefined) {
    if (!(input.maxScore > 0)) throw new StateError("الدرجة العظمى يجب أن تكون > 0");
    // العظمى الجديدة لا يجوز أن تكون دون أعلى درجة مرصودة
    const top = await prisma.grade.aggregate({
      where: { assessmentId: input.id, status: "normal", score: { not: null } },
      _max: { score: true },
    });
    if (top._max.score != null && input.maxScore < top._max.score)
      throw new StateError(`توجد درجة مرصودة ${top._max.score} — العظمى لا يمكن أن تصبح دونها`);
    data.maxScore = input.maxScore;
  }
  return prisma.assessment.update({ where: { id: input.id }, data });
}

/** حذف تقييم ودرجاته (تتالى) — للمالك أو المدير */
export async function deleteAssessment(actor: Actor, input: { id: string }) {
  requireTeacher(actor);
  await assertOwnAssessment(actor, input.id);
  return prisma.assessment.delete({ where: { id: input.id } });
}

/** نشر التقييم أو إعادته مسودة — المنشور فقط يدخل التقارير وبوابة الأهل */
export async function publishAssessment(
  actor: Actor,
  input: { id: string; publish: boolean },
) {
  requireTeacher(actor);
  const a = await assertOwnAssessment(actor, input.id);
  if (input.publish && a.publishedAt) return a; // منشور أصلاً
  return prisma.assessment.update({
    where: { id: input.id },
    data: { publishedAt: input.publish ? new Date() : null },
  });
}

/** رصد درجة طالب — المعلم لا يرصد إلا في تقييمه هو؛ الحالة غير normal تُفرّغ الدرجة */
export async function setGrade(
  actor: Actor,
  input: {
    assessmentId: string;
    studentId: string;
    score: number | null;
    status?: GradeStatus;
    note?: string;
  },
) {
  requireTeacher(actor);
  const assessment = await assertOwnAssessment(actor, input.assessmentId);
  const status: GradeStatus =
    input.status && (GRADE_STATUSES as readonly string[]).includes(input.status)
      ? input.status
      : "normal";
  const score = status === "normal" ? input.score : null;

  if (score !== null) {
    if (score < 0 || score > assessment.maxScore)
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
      score,
      status,
      note: input.note?.trim() || null,
    },
    update: { score, status, note: input.note?.trim() || null },
  });
}

/** رصد عمود كامل دفعة واحدة — تعبئة بالعظمى/مسح/لصق درجات كشف */
export async function bulkSetGrades(
  actor: Actor,
  input: {
    assessmentId: string;
    rows: { studentId: string; score?: number | null; status?: GradeStatus }[];
  },
) {
  requireTeacher(actor);
  const assessment = await assertOwnAssessment(actor, input.assessmentId);
  const yearId = await currentYearId();
  const roster = new Set(
    (
      await prisma.enrollment.findMany({
        where: { classId: assessment.classId, academicYearId: yearId },
        select: { studentId: true },
      })
    ).map((e) => e.studentId),
  );

  let saved = 0;
  for (const row of input.rows) {
    if (!roster.has(row.studentId)) continue; // طالب خارج الصف — يُخطّى
    const status: GradeStatus =
      row.status && (GRADE_STATUSES as readonly string[]).includes(row.status)
        ? row.status
        : "normal";
    const score = status === "normal" ? (row.score ?? null) : null;
    if (score !== null && (score < 0 || score > assessment.maxScore)) continue;
    await prisma.grade.upsert({
      where: {
        assessmentId_studentId: {
          assessmentId: input.assessmentId,
          studentId: row.studentId,
        },
      },
      create: {
        assessmentId: input.assessmentId,
        studentId: row.studentId,
        score,
        status,
      },
      update: { score, status },
    });
    saved++;
  }
  return saved;
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

/** أوزان أنواع التقييم لمادة — يقرأ Subject.gradeWeights ويعيد null إن لم تُضبط */
export type GradeWeights = Partial<Record<AssessmentKind, number>>;
export function parseGradeWeights(raw: unknown): GradeWeights | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: GradeWeights = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k as AssessmentKind] = n;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * يحسب الدرجة الأكاديمية (نسبة) والتقدير (حرف) من درجات التقييمات.
 * - الحالات غير normal (غائب/بعذر/معفى) تُستثنى دائماً — لا تُحتسب صفراً.
 * - بوزن المادة (إن ضُبط): متوسط موزون لمتوسط نسبة كل نوع له درجات.
 * - بلا أوزان (الوضع الافتراضي): متوسط نسب الاختبار والاختبار القصير فقط.
 * يعيد null إن لم توجد درجات صالحة.
 */
export function academicStats(
  items: { score: number | null; max: number; kind: string; status?: string }[],
  weights?: GradeWeights | null,
): { pct: number; letter: AppreciationLetter } | null {
  const scored = items.filter(
    (i) => i.score != null && i.max > 0 && (i.status ?? "normal") === "normal",
  );
  if (!scored.length) return null;

  if (weights && Object.values(weights).some((w) => w && w > 0)) {
    let acc = 0, wSum = 0;
    for (const [kind, w] of Object.entries(weights)) {
      if (!w || w <= 0) continue;
      const ks = scored.filter((i) => i.kind === kind);
      if (!ks.length) continue;
      acc += w * (ks.reduce((s, i) => s + (i.score! / i.max) * 100, 0) / ks.length);
      wSum += w;
    }
    if (!wSum) return null;
    const pct = acc / wSum;
    return { pct: Math.round(pct * 10) / 10, letter: letterFromPct(pct) };
  }

  const exams = scored.filter((i) => APPRECIATION_KINDS.has(i.kind));
  if (!exams.length) return null;
  const pct =
    exams.reduce((sum, i) => sum + (i.score! / i.max) * 100, 0) / exams.length;
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

/**
 * الخطة الأسبوعية — إدخال لكل معلم/مادة ثم تجميع مركزي للصف.
 *
 * كل معلم يحرّر WeeklyPlan خاصته (مسودة → مسلّمة)، والإدارة تجمّع
 * الخطط المسلّمة في ClassWeeklyPlanPublication مجمّدة وتنشرها —
 * فيُدرج حدث plan_notify واحد لكل ولي أمر موثق لطلاب الصف.
 */
import { prisma } from "@app/db";
import { requireAdmin, requireTeacher, ForbiddenError, NotFoundError } from "../permissions";
import type { Actor } from "../permissions";
import { weekStartOf } from "./grades";

const WEEKDAY_AR: Record<number, string> = {
  0: "الأحد", 1: "الاثنين", 2: "الثلاثاء", 3: "الأربعاء",
  4: "الخميس", 5: "الجمعة", 6: "السبت",
};

/** أسماء أيام المدرسة مرتبة من الإعدادات (1=الاثنين ..) */
export async function schoolWeekDays(): Promise<{ weekday: number; name: string }[]> {
  const s = await prisma.schoolSettings.findUnique({
    where: { id: "school" },
    select: { weekDays: true },
  });
  return (s?.weekDays ?? [1, 2, 3, 4, 5])
    .slice()
    .sort((a, b) => a - b)
    .map((w) => ({ weekday: w, name: WEEKDAY_AR[w] ?? `يوم ${w}` }));
}

export interface PlanEntryInput {
  weekday: number;
  lessonTitle?: string;
  textbook?: string;
  platforms?: string;
  tests?: string;
  notes?: string;
}

/** حفظ/تحرير خطة — المعلم مقيّد بإسناداته، الإدارة تحرر أي إسناد */
export async function savePlan(
  actor: Actor,
  input: {
    teacherId?: string;
    classId: string;
    subjectId: string;
    weekStart: Date;
    entries: PlanEntryInput[];
  },
): Promise<{ planId: string }> {
  requireTeacher(actor);
  const teacherId = actor.role === "admin" && input.teacherId
    ? input.teacherId
    : actor.userId;

  // لا خطة بلا إسناد فعلي — نفس قاعدة الحصص
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) throw new NotFoundError("لا عام دراسياً حالياً");
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      teacherId, classId: input.classId, subjectId: input.subjectId,
      academicYearId: year.id, isActive: true,
    },
  });
  if (!assignment)
    throw new ForbiddenError("هذا الصف/المادة غير مسند لهذا المعلم");

  const weekStart = weekStartOf(input.weekStart);
  const plan = await prisma.weeklyPlan.upsert({
    where: {
      teacherId_classId_subjectId_weekStart: {
        teacherId, classId: input.classId, subjectId: input.subjectId, weekStart,
      },
    },
    create: {
      teacherId, classId: input.classId, subjectId: input.subjectId, weekStart,
    },
    update: {},
  });

  await prisma.weeklyPlanEntry.deleteMany({ where: { planId: plan.id } });
  const rows = input.entries.filter(
    (e) =>
      (e.lessonTitle?.trim() || e.textbook?.trim() || e.platforms?.trim() ||
        e.tests?.trim() || e.notes?.trim()),
  );
  if (rows.length) {
    await prisma.weeklyPlanEntry.createMany({
      data: rows.map((e) => ({
        planId: plan.id,
        weekday: e.weekday,
        lessonTitle: e.lessonTitle?.trim() || null,
        textbook: e.textbook?.trim() || null,
        platforms: e.platforms?.trim() || null,
        tests: e.tests?.trim() || null,
        notes: e.notes?.trim() || null,
      })),
    });
  }
  return { planId: plan.id };
}

/** تسليم الخطة للتجميع — المالك أو الإدارة */
export async function submitPlan(actor: Actor, planId: string): Promise<void> {
  requireTeacher(actor);
  const plan = await prisma.weeklyPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError("الخطة غير موجودة");
  if (actor.role !== "admin" && plan.teacherId !== actor.userId)
    throw new ForbiddenError();
  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: { status: "submitted", submittedAt: new Date() },
  });
}

/** إعادة خطة مسلّمة للمسودة — تعديل بعد التسليم */
export async function unsubmitPlan(actor: Actor, planId: string): Promise<void> {
  requireTeacher(actor);
  const plan = await prisma.weeklyPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError("الخطة غير موجودة");
  if (actor.role !== "admin" && plan.teacherId !== actor.userId)
    throw new ForbiddenError();
  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: { status: "draft", submittedAt: null },
  });
}

export interface ClassPlanRow {
  assignmentId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  planId: string | null;
  status: "missing" | "draft" | "submitted";
}

/** حالة خطط كل إسنادات الصف لأسبوع — لوحة تجميع الإدارة */
export async function classPlanMatrix(
  classId: string,
  weekStart: Date,
): Promise<ClassPlanRow[]> {
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const assignments = await prisma.teachingAssignment.findMany({
    where: { classId, academicYearId: year?.id, isActive: true },
    include: { subject: { select: { id: true, name: true } } },
    orderBy: { subject: { name: "asc" } },
  });
  // teacherId بلا علاقة — أسماء المعلمين بدفعة واحدة
  const teachers = await prisma.user.findMany({
    where: { id: { in: [...new Set(assignments.map((a) => a.teacherId))] } },
    select: { id: true, name: true, isActive: true },
  });
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const plans = await prisma.weeklyPlan.findMany({
    where: { classId, weekStart: weekStartOf(weekStart) },
    select: { id: true, teacherId: true, subjectId: true, status: true },
  });
  const key = (t: string, s: string) => `${t}|${s}`;
  const byKey = new Map(plans.map((p) => [key(p.teacherId, p.subjectId), p]));
  return assignments
    .filter((a) => teacherById.get(a.teacherId)?.isActive)
    .map((a) => {
      const p = byKey.get(key(a.teacherId, a.subjectId));
      return {
        assignmentId: a.id,
        teacherId: a.teacherId,
        teacherName: teacherById.get(a.teacherId)?.name ?? "—",
        subjectId: a.subject.id,
        subjectName: a.subject.name,
        planId: p?.id ?? null,
        status: p ? (p.status as "draft" | "submitted") : "missing",
      };
    });
}

export interface PublishedPlanSubject {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  /** خطة غير مسلّمة — تظهر فارغة بعلامة «لم تُسلَّم» */
  missing: boolean;
  entries: {
    weekday: number;
    lessonTitle: string | null;
    textbook: string | null;
    platforms: string | null;
    tests: string | null;
    notes: string | null;
  }[];
}

/** تجميع الخطط المسلّمة في لقطة موحّدة + إدراج إشعارات لأولياء الأمور — إدارة فقط */
export async function publishClassPlan(
  actor: Actor,
  input: { classId: string; weekStart: Date },
): Promise<{ publicationId: string; subjects: number; guardians: number }> {
  requireAdmin(actor);
  const weekStart = weekStartOf(input.weekStart);

  // كل إسنادات الصف — المسلّمة ببنودها وغيرها تُعلَّم «لم تُسلَّم»
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const assignments = await prisma.teachingAssignment.findMany({
    where: { classId: input.classId, academicYearId: year?.id, isActive: true },
    include: { subject: { select: { id: true, name: true } } },
    orderBy: { subject: { name: "asc" } },
  });
  const teachers = await prisma.user.findMany({
    where: { id: { in: [...new Set(assignments.map((a) => a.teacherId))] } },
    select: { id: true, name: true, isActive: true },
  });
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const plans = await prisma.weeklyPlan.findMany({
    where: { classId: input.classId, weekStart },
    include: { entries: { orderBy: { weekday: "asc" } } },
  });
  const byKey = new Map(plans.map((p) => [`${p.teacherId}|${p.subjectId}`, p]));
  const subjects: PublishedPlanSubject[] = assignments
    .filter((a) => teacherById.get(a.teacherId)?.isActive)
    .map((a) => {
      const p = byKey.get(`${a.teacherId}|${a.subject.id}`);
      const submitted = p?.status === "submitted";
      return {
        subjectId: a.subject.id,
        subjectName: a.subject.name,
        teacherName: teacherById.get(a.teacherId)?.name ?? "—",
        missing: !submitted,
        entries: submitted
          ? p!.entries.map((e) => ({
              weekday: e.weekday,
              lessonTitle: e.lessonTitle,
              textbook: e.textbook,
              platforms: e.platforms,
              tests: e.tests,
              notes: e.notes,
            }))
          : [],
      };
    });
  if (!subjects.some((s) => !s.missing))
    throw new NotFoundError("لا خطط مسلّمة لهذا الصف والأسبوع");

  const publication = await prisma.classWeeklyPlanPublication.create({
    data: {
      classId: input.classId,
      weekStart,
      contentJson: subjects as never,
      publishedById: actor.userId,
    },
  });

  // أولياء أمور طلاب الصف الموثقون — dedupe بالمحادثة (الإخوة برسالة واحدة)
  const links = await prisma.guardianStudent.findMany({
    where: {
      verified: true,
      student: {
        isActive: true,
        enrollments: {
          some: { classId: input.classId, academicYearId: year?.id },
        },
      },
    },
    include: {
      guardian: { include: { user: { select: { telegramChatId: true, isActive: true } } } },
    },
  });
  const seen = new Set<string>();
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
          telegramChatId: l.guardian.user.telegramChatId,
        },
      },
      update: {},
    });
    guardians++;
  }

  return { publicationId: publication.id, subjects: subjects.length, guardians };
}

/** لقطات منشورة لصفوف أبناء ولي أمر */
export async function publicationsForGuardian(
  actor: Actor,
): Promise<
  { id: string; weekStart: Date; className: string; subjects: number; publishedAt: Date }[]
> {
  const profile = await prisma.guardianProfile.findUnique({
    where: { userId: actor.userId },
    include: {
      children: {
        where: { verified: true },
        include: {
          student: {
            include: {
              enrollments: {
                include: { class: { select: { id: true, displayName: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!profile) return [];
  const classIds = new Map<string, string>();
  for (const c of profile.children)
    for (const e of c.student.enrollments)
      classIds.set(e.class.id, e.class.displayName ?? e.class.name);

  const pubs = await prisma.classWeeklyPlanPublication.findMany({
    where: { classId: { in: [...classIds.keys()] } },
    orderBy: { publishedAt: "desc" },
    take: 12,
  });
  return pubs.map((p) => ({
    id: p.id,
    weekStart: p.weekStart,
    className: classIds.get(p.classId) ?? "الصف",
    subjects: (p.contentJson as unknown[]).length,
    publishedAt: p.publishedAt,
  }));
}

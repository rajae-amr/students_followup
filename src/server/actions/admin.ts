"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@app/db";
import { drainOutbox } from "@/lib/jobs/drain";
import { auth, createGuardianAccount, createTeacherAccount, generatePassword } from "@app/auth";
import { generateWeeklyDigests, ADMIN_PERMS, parseStudentsXlsx, parseTeachersXlsx } from "@app/core";
import { hashPassword } from "better-auth/crypto";
import { requireRole, requirePerm, requireActor } from "../session";
import { notifyUsers, reportManagerIds } from "../notify";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

async function currentYear() {
  const y = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!y) throw new Error("لا يوجد عام دراسي حالي");
  return y;
}

export async function addClass(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const name = String(formData.get("name") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const gradeId = String(formData.get("gradeId") ?? "").trim() || null;
    if (!name || !displayName) return fail("الاسم والاسم المعروض مطلوبان");
    const year = await currentYear();
    await prisma.classGroup.create({
      data: { name, displayName, academicYearId: year.id, gradeId },
    });
    revalidatePath("/admin/students");
    revalidatePath("/admin/classes");
    return { ok: true };
  } catch {
    return fail("تعذر إنشاء الصف — ربما الاسم موجود");
  }
}

// ============ المستويات الصفية ============

/** إضافة مستوى صفّي — يُلحق بآخر الترتيب */
export async function addGradeLevel(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return fail("اسم المستوى مطلوب");
    const max = await prisma.gradeLevel.aggregate({ _max: { order: true } });
    await prisma.gradeLevel.create({ data: { name, order: (max._max.order ?? 0) + 1 } });
    revalidatePath("/admin/classes");
    return { ok: true, message: "أُضيف المستوى" };
  } catch {
    return fail("تعذر الإضافة — ربما الاسم موجود");
  }
}

/** إعادة تسمية مستوى */
export async function renameGradeLevel(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    if (!id || !name) return fail("الاسم مطلوب");
    await prisma.gradeLevel.update({ where: { id }, data: { name } });
    revalidatePath("/admin/classes");
    return { ok: true, message: "حُدّث الاسم" };
  } catch {
    return fail("تعذر التحديث");
  }
}

/** تحريك مستوى في الترتيب — dir: -1 أعلى / +1 أسفل */
export async function moveGradeLevel(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    const dir = Number(formData.get("dir"));
    if (!id || ![1, -1].includes(dir)) return fail("بيانات غير صحيحة");
    const levels = await prisma.gradeLevel.findMany({ orderBy: { order: "asc" } });
    const i = levels.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= levels.length) return fail("لا يمكن التحريك");
    await prisma.$transaction([
      prisma.gradeLevel.update({ where: { id: levels[i]!.id }, data: { order: levels[j]!.order } }),
      prisma.gradeLevel.update({ where: { id: levels[j]!.id }, data: { order: levels[i]!.order } }),
    ]);
    revalidatePath("/admin/classes");
    return { ok: true };
  } catch {
    return fail("تعذر التحريك");
  }
}

/** حذف مستوى — فارغ فقط (لا صفوف ولا كوتا مرتبطة) */
export async function deleteGradeLevel(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    const refs = await prisma.gradeLevel.findUnique({
      where: { id },
      include: { _count: { select: { classes: true, gradeQuotas: true } } },
    });
    if (!refs) return fail("المستوى غير موجود");
    if (refs._count.classes || refs._count.gradeQuotas)
      return fail("المستوى مرتبط بصفوف أو كوتا — انقلها أولاً");
    await prisma.gradeLevel.delete({ where: { id } });
    revalidatePath("/admin/classes");
    return { ok: true, message: "حُذف المستوى" };
  } catch {
    return fail("تعذر الحذف");
  }
}

export async function addStudent(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const fullName = String(formData.get("fullName") ?? "").trim();
    const classId = String(formData.get("classId") ?? "");
    const gender = String(formData.get("gender") ?? "").trim();
    const guardianName = String(formData.get("guardianName") ?? "").trim();
    const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
    if (!fullName || !classId) return fail("اسم الطالب والصف مطلوبان");
    const year = await currentYear();
    const student = await prisma.student.create({
      data: {
        fullName,
        ...(gender ? { gender } : {}),
        ...(guardianName ? { guardianName } : {}),
        ...(guardianPhone ? { guardianPhone } : {}),
      },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId, academicYearId: year.id },
    });
    revalidatePath("/admin/students");
    return { ok: true };
  } catch {
    return fail("تعذر إضافة الطالب");
  }
}

export async function addSubject(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return fail("اسم المادة مطلوب");
    await prisma.subject.create({ data: { name } });
    revalidatePath("/admin/subjects");
    revalidatePath("/admin/assignments");
    return { ok: true };
  } catch {
    return fail("المادة موجودة مسبقاً");
  }
}

export async function addTimetableSlot(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const teacherId = String(formData.get("teacherId") ?? "");
    const classId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const weekday = Number(formData.get("weekday"));
    const period = Number(formData.get("period"));
    if (!teacherId || !classId || !subjectId || !(weekday >= 0 && weekday <= 6) || !(period >= 1))
      return fail("كل الحقول مطلوبة");

    const year = await currentYear();

    // فحص تعارض فعلي: نفس المعلم أو نفس الصف مشغول في هذه الخانة
    const clash = await prisma.timetableSlot.findFirst({
      where: {
        effectiveTo: null,
        weekday,
        period,
        OR: [{ teacherId }, { classId }],
      },
      include: { class: true, subject: true },
    });
    if (clash) {
      const who = clash.teacherId === teacherId ? "المعلم مشغول" : `الصف مشغول (${clash.subject.name})`;
      return fail(`تعارض: ${who} في هذا الموعد`);
    }

    await prisma.$transaction(async (tx) => {
      // إسناد المعلم للصف/المادة إن لم يكن موجوداً
      await tx.teachingAssignment.upsert({
        where: {
          teacherId_classId_subjectId_academicYearId: {
            teacherId, classId, subjectId, academicYearId: year.id,
          },
        },
        create: { teacherId, classId, subjectId, academicYearId: year.id },
        update: { isActive: true },
      });
      // assignmentId يبقى null — علامة «خانة يدوية» فوق الجدول المولّد
      await tx.timetableSlot.create({
        data: {
          teacherId, classId, subjectId, weekday, period,
          effectiveFrom: year.startDate,
        },
      });
    });
    revalidatePath("/admin/timetable");
    revalidatePath("/admin/assignments");
    return { ok: true, message: "أُضيفت الخانة اليدوية" };
  } catch {
    return fail("تعذر إضافة الحصة — تحقق من عدم التعارض");
  }
}

export async function deleteTimetableSlot(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    await prisma.timetableSlot.delete({ where: { id } });
    revalidatePath("/admin/timetable");
    return { ok: true, message: "حُذفت الخانة" };
  } catch {
    return fail("تعذر حذف الحصة");
  }
}

/**
 * حذف نهائي لحساب معلم موقوف — يُرفض إن كانت سجلات تشير إليه
 * (جلسات/خانات/سلوك/تقييمات/خطط) حفاظاً على السجل التاريخي.
 */
export async function deleteTeacherUserAction(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const id = String(formData.get("id") ?? "");
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== "teacher") return fail("المعلم غير موجود");
    if (user.isActive) return fail("أوقف الحساب أولاً قبل حذفه نهائياً");

    const [slots, sessions, behaviors, assessments, evals, notes, plans, audits] = await Promise.all([
      prisma.timetableSlot.count({ where: { teacherId: id } }),
      prisma.lessonSession.count({ where: { teacherId: id } }),
      prisma.behaviorEntry.count({ where: { teacherId: id } }),
      prisma.assessment.count({ where: { teacherId: id } }),
      prisma.evaluation.count({ where: { teacherId: id } }),
      prisma.note.count({ where: { authorId: id } }),
      prisma.weeklyPlan.count({ where: { teacherId: id } }),
      prisma.auditEvent.count({ where: { actorId: id } }),
    ]);
    const refs = slots + sessions + behaviors + assessments + evals + notes + plans + audits;
    if (refs > 0) {
      return fail(`لا يمكن الحذف — ${refs} سجلاً تشير لهذا المعلم (جلسات/خانات/خطط). أبقِه موقوفاً`);
    }

    await prisma.$transaction([
      prisma.teachingAssignment.deleteMany({ where: { teacherId: id } }),
      prisma.teacherAvailability.deleteMany({ where: { teacherId: id } }),
      prisma.account.deleteMany({ where: { userId: id } }),
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }), // TeacherProfile يتبعه بالتتالي
    ]);
    revalidatePath("/admin/users");
    return { ok: true, message: "حُذف حساب المعلم نهائياً" };
  } catch {
    return fail("تعذر الحذف");
  }
}

/**
 * استبدال معلم: ينقل إسناداته النشطة وخانات جدوله السارية إلى البديل
 * ويوقف حساب القديم — سجلاته التاريخية تبقى منسوبة إليه (هو من درّسها).
 */
export async function replaceTeacherAction(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const fromId = String(formData.get("fromId") ?? "");
    const toId = String(formData.get("toId") ?? "");
    if (!fromId || !toId) return fail("اختر المعلمَين");
    if (fromId === toId) return fail("لا يمكن استبدال معلم بنفسه");

    const [from, to] = await Promise.all([
      prisma.user.findUnique({ where: { id: fromId } }),
      prisma.user.findUnique({ where: { id: toId } }),
    ]);
    if (!from || from.role !== "teacher") return fail("المعلم المغادر غير موجود");
    if (!to || to.role !== "teacher" || !to.isActive) return fail("المعلم البديل غير موجود أو موقوف");

    const year = await currentYear();
    let moved = 0;
    let merged = 0;

    await prisma.$transaction(async (tx) => {
      const assignments = await tx.teachingAssignment.findMany({
        where: { teacherId: fromId, academicYearId: year.id, isActive: true },
      });
      for (const a of assignments) {
        // إن كان البديل مسنداً لنفس الثلاثية أصلاً: دمج — عطّل القديم ووجّه خاناته لإسناد البديل
        const existing = await tx.teachingAssignment.findUnique({
          where: {
            teacherId_classId_subjectId_academicYearId: {
              teacherId: toId, classId: a.classId, subjectId: a.subjectId, academicYearId: year.id,
            },
          },
        });
        if (existing) {
          await tx.teachingAssignment.update({ where: { id: existing.id }, data: { isActive: true } });
          await tx.timetableSlot.updateMany({ where: { assignmentId: a.id }, data: { assignmentId: existing.id } });
          await tx.generatedTimetableEntry.updateMany({ where: { assignmentId: a.id }, data: { assignmentId: existing.id } });
          await tx.teachingAssignment.update({ where: { id: a.id }, data: { isActive: false } });
          merged++;
        } else {
          // نقل صف الإسناد نفسه — خاناته المولّدة تبقى صالحة (تشير لمعرّف الإسناد)
          await tx.teachingAssignment.update({ where: { id: a.id }, data: { teacherId: toId } });
          moved++;
        }
      }
      // خانات الجدول السارية للمغادر تتحول للبديل (التاريخية المنتهية تبقى باسمه)
      await tx.timetableSlot.updateMany({
        where: { teacherId: fromId, effectiveTo: null },
        data: { teacherId: toId },
      });
      // إيقاف المغادر
      await tx.user.update({ where: { id: fromId }, data: { isActive: false } });
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/subjects");
    revalidatePath("/admin/timetable");
    return {
      ok: true,
      message: `نُقل ${moved + merged} إسناداً إلى «${to.name}» (${merged} دُمجت مع موجودة) — «${from.name}» موقوف الآن`,
    };
  } catch {
    return fail("تعذر الاستبدال");
  }
}

export type BulkAccountRow = {
  names: string;
  username: string;
  password: string | null; // null = حساب قائم مسبقاً
};
export type BulkAccountsResult =
  | { ok: true; rows: BulkAccountRow[]; skipped: number; notes?: string[] }
  | { ok: false; error: string };

function normPhone(p: string): string {
  return p.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * إنشاء آلي لحسابات أولياء أمور صف كامل:
 * يجمع الطلاب برقم الهاتف (الإخوة بحساب واحد)، يعيد بيانات الدخول مرة واحدة للطباعة.
 * كلمة المرور أولية — يُلزم الولي بتغييرها عند أول دخول.
 */
export async function createGuardianAccounts(
  formData: FormData,
): Promise<BulkAccountsResult> {
  try {
    const actor = await requirePerm("students");
    const classId = String(formData.get("classId") ?? "");
    if (!classId) return { ok: false, error: "الصف مطلوب" };
    const year = await currentYear();

    const enrolls = await prisma.enrollment.findMany({
      where: { classId, academicYearId: year.id, student: { isActive: true, guardianPhone: { not: null } } },
      include: {
        student: {
          select: {
            id: true, fullName: true, guardianName: true, guardianPhone: true,
            guardians: { where: { verified: true }, select: { id: true } },
          },
        },
      },
    });

    // تجميع برقم الهاتف المطبّع — الإخوة تحت حساب واحد
    const byPhone = new Map<string, typeof enrolls>();
    for (const e of enrolls) {
      if (e.student.guardians.length) continue; // مربوط فعلاً
      const key = normPhone(e.student.guardianPhone!).slice(-9);
      byPhone.set(key, [...(byPhone.get(key) ?? []), e]);
    }

    const profiles = await prisma.guardianProfile.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true },
    });
    const rows: BulkAccountRow[] = [];

    for (const [key, group] of byPhone) {
      // ملف قائم بنفس الرقم؟ أعد استخدامه (أخ مسجل سابقاً)
      const existing = profiles.find(
        (x) => x.phone && normPhone(x.phone).slice(-9) === key,
      );
      let guardianId: string, username: string, password: string | null;
      if (existing) {
        guardianId = existing.id;
        const u = await prisma.user.findFirst({
          where: { guardianProfile: { id: guardianId } },
          select: { username: true },
        });
        username = u?.username ?? "—";
        password = null;
      } else {
        const first = group[0]!.student;
        const displayName =
          first.guardianName && first.guardianName !== "ولي الأمر"
            ? first.guardianName
            : `ولي أمر ${first.fullName.split(" ").slice(0, 2).join(" ")}`;
        password = generatePassword();
        const acc = await createGuardianAccount({
          displayName,
          phone: first.guardianPhone,
          password,
          mustChangePassword: true,
        });
        guardianId = acc.guardianId;
        username = acc.username;
      }
      for (const e of group) {
        await prisma.guardianStudent.upsert({
          where: { guardianId_studentId: { guardianId, studentId: e.studentId } },
          create: {
            guardianId, studentId: e.studentId,
            verified: true, createdById: actor.userId,
          },
          update: { verified: true },
        });
      }
      rows.push({
        names: group.map((e) => e.student.fullName).join("، "),
        username,
        password,
      });
    }

    const skipped = enrolls.length - [...byPhone.values()].flat().length;
    revalidatePath(`/admin/students/${classId}`);
    return { ok: true, rows, skipped };
  } catch {
    return { ok: false, error: "تعذر إنشاء الحسابات" };
  }
}

/**
 * ربط ولي أمر موجود بطالب — أخ يلتحق لاحقاً أو تصحيح ربط.
 */
export async function linkGuardianToStudent(
  formData: FormData,
): Promise<Result> {
  try {
    const actor = await requirePerm("students");
    const studentId = String(formData.get("studentId") ?? "");
    const guardianId = String(formData.get("guardianId") ?? "");
    if (!studentId || !guardianId) return fail("بيانات ناقصة");
    await prisma.guardianStudent.upsert({
      where: { guardianId_studentId: { guardianId, studentId } },
      create: { guardianId, studentId, verified: true, createdById: actor.userId },
      update: { verified: true },
    });
    revalidatePath(`/admin/students`);
    revalidatePath("/admin/users/guardians");
    return { ok: true, message: "رُبط ولي الأمر بالطالب" };
  } catch {
    return fail("تعذر الربط");
  }
}

/** فك ربط ولي أمر عن طالب — لا يحذف حساب الولي نفسه */
export async function unlinkGuardian(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const linkId = String(formData.get("linkId") ?? "");
    if (!linkId) return fail("بيانات ناقصة");
    await prisma.guardianStudent.delete({ where: { id: linkId } });
    revalidatePath(`/admin/students`);
    revalidatePath("/admin/users/guardians");
    return { ok: true, message: "فُكّ الربط" };
  } catch {
    return fail("تعذر فك الربط");
  }
}

/** تبديل صلاحية عرض التقارير لولي أمر مرتبط */
export async function toggleGuardianReports(
  formData: FormData,
): Promise<Result> {
  try {
    await requirePerm("students");
    const linkId = String(formData.get("linkId") ?? "");
    const link = await prisma.guardianStudent.findUnique({ where: { id: linkId } });
    if (!link) return fail("الربط غير موجود");
    await prisma.guardianStudent.update({
      where: { id: linkId },
      data: { canViewReports: !link.canViewReports },
    });
    revalidatePath(`/admin/students`);
    revalidatePath("/admin/users/guardians");
    return { ok: true, message: link.canViewReports ? "أُوقف عرض التقارير له" : "أُعيد عرض التقارير له" };
  } catch {
    return fail("تعذر التعديل");
  }
}

/**
 * إنشاء حساب ولي أمر فردي لطالب محدد — كلمة مرور أولية + قسيمة طباعة.
 * يعيد بيانات الدخول مرة واحدة على الشاشة.
 */
export async function createStudentGuardianAccount(
  formData: FormData,
): Promise<BulkAccountsResult> {
  try {
    const actor = await requirePerm("students");
    const studentId = String(formData.get("studentId") ?? "");
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return { ok: false, error: "الطالب غير موجود" };

    const phone =
      String(formData.get("phone") ?? "").trim() || student.guardianPhone;
    const displayName =
      String(formData.get("displayName") ?? "").trim() ||
      (student.guardianName && student.guardianName !== "ولي الأمر"
        ? student.guardianName
        : `ولي أمر ${student.fullName.split(" ").slice(0, 2).join(" ")}`);
    if (!phone) return { ok: false, error: "هاتف ولي الأمر مطلوب — سجّله في البيانات أولاً" };

    // ملف قائم بنفس الرقم؟ أعد استخدامه بدل تكرار الحساب
    const profiles = await prisma.guardianProfile.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true },
    });
    const tail = normPhone(phone).slice(-9);
    const existing = profiles.find(
      (p) => p.phone && normPhone(p.phone).slice(-9) === tail,
    );

    let guardianId: string, username: string, password: string | null;
    if (existing) {
      guardianId = existing.id;
      const u = await prisma.user.findFirst({
        where: { guardianProfile: { id: guardianId } },
        select: { username: true },
      });
      username = u?.username ?? "—";
      password = null;
    } else {
      password = generatePassword();
      const acc = await createGuardianAccount({
        displayName,
        phone,
        password,
        mustChangePassword: true,
      });
      guardianId = acc.guardianId;
      username = acc.username;
    }
    await prisma.guardianStudent.upsert({
      where: { guardianId_studentId: { guardianId, studentId } },
      create: { guardianId, studentId, verified: true, createdById: actor.userId },
      update: { verified: true },
    });
    revalidatePath(`/admin/students`);
    return {
      ok: true,
      rows: [{ names: student.fullName, username, password }],
      skipped: 0,
    };
  } catch {
    return { ok: false, error: "تعذر إنشاء الحساب" };
  }
}

/**
 * إنشاء حساب معلم مباشر — بديل للدعوة: كلمة مرور أولية + تغيير إلزامي.
 * الهاتف يمكّنه من ربط تيليجرام ذاتياً بمشاركة جهة الاتصال.
 */
export async function createTeacherAccountAction(
  formData: FormData,
): Promise<BulkAccountsResult> {
  try {
    await requireRole("admin");
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "اسم المعلم مطلوب" };
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const subject = String(formData.get("subject") ?? "").trim() || null;
    const password = generatePassword();
    const acc = await createTeacherAccount({
      displayName: name,
      phone,
      password,
      defaultSubject: subject,
      mustChangePassword: true,
    });
    revalidatePath("/admin/users", "layout");
    return { ok: true, rows: [{ names: name, username: acc.username, password }], skipped: 0 };
  } catch {
    return { ok: false, error: "تعذر إنشاء حساب المعلم" };
  }
}

/**
 * استيراد معلمين جماعي من قالب Excel — لكل صف يُنشأ حساب معلم
 * بكلمة مرور أولية وتُعاد بيانات الدخول مرة واحدة للطباعة كقسائم.
 */
export async function importTeachers(
  formData: FormData,
): Promise<BulkAccountsResult> {
  try {
    await requireRole("admin");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "اختر ملفاً" };
    if (!/\.xlsx?$/i.test(file.name))
      return { ok: false, error: "ارفع ملف Excel بالقالب (.xlsx)" };

    const parsed = await parseTeachersXlsx(Buffer.from(await file.arrayBuffer()));
    if (!parsed.rows.length)
      return { ok: false, error: parsed.errors[0] ?? "لا توجد صفوف صالحة في الملف" };

    const validSubjects = new Set(
      (await prisma.subject.findMany({ where: { isActive: true }, select: { name: true } }))
        .map((s) => s.name),
    );
    const existing = new Set(
      (await prisma.user.findMany({ where: { role: "teacher" }, select: { name: true } }))
        .map((u) => u.name.trim()),
    );

    const rows: BulkAccountRow[] = [];
    const notes = [...parsed.errors];
    let skipped = 0;

    for (const r of parsed.rows) {
      if (existing.has(r.name)) {
        skipped++;
        notes.push(`سطر ${r.row}: «${r.name}» موجود مسبقاً — تخطّي`);
        continue;
      }
      const subject = r.subject && validSubjects.has(r.subject) ? r.subject : null;
      if (r.subject && !subject) notes.push(`سطر ${r.row}: مادة «${r.subject}» غير معروفة — أُنشئ بلا مادة`);
      try {
        const password = generatePassword();
        const acc = await createTeacherAccount({
          displayName: r.name,
          phone: r.phone || null,
          password,
          defaultSubject: subject,
          mustChangePassword: true,
        });
        existing.add(r.name);
        rows.push({ names: r.name, username: acc.username, password });
      } catch {
        skipped++;
        notes.push(`سطر ${r.row}: تعذر إنشاء «${r.name}»`);
      }
    }

    revalidatePath("/admin/users", "layout");
    return { ok: true, rows, skipped, notes: notes.length ? notes : undefined };
  } catch {
    return { ok: false, error: "تعذر الاستيراد — تحقق من تنسيق الملف" };
  }
}

// ============ إعدادات المدرسة والتقويم ============

export async function updateSettings(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const schoolName = String(formData.get("schoolName") ?? "").trim();
    const periodsPerDay = Number(formData.get("periodsPerDay"));
    const absentFullDayThreshold = Number(formData.get("absentFullDayThreshold"));
    const excusedFullDayThreshold = Number(formData.get("excusedFullDayThreshold"));
    const weekDays = formData.getAll("weekDays").map(Number);
    const autoAbsenceAlert = formData.get("autoAbsenceAlert") === "on";
    if (!schoolName) return fail("اسم المدرسة مطلوب");
    if (!(periodsPerDay >= 1 && periodsPerDay <= 12)) return fail("عدد الحصص غير صالح");
    if (!(absentFullDayThreshold >= 1 && absentFullDayThreshold <= periodsPerDay))
      return fail("عتبة الغياب غير صالحة");
    if (!weekDays.length) return fail("اختر أيام الدوام");

    const s = await prisma.schoolSettings.findUnique({ where: { id: "school" } });
    const policyChanged =
      s &&
      (s.absentFullDayThreshold !== absentFullDayThreshold ||
        s.excusedFullDayThreshold !== excusedFullDayThreshold);

    await prisma.schoolSettings.upsert({
      where: { id: "school" },
      create: {
        id: "school", schoolName, periodsPerDay,
        absentFullDayThreshold, excusedFullDayThreshold, weekDays, autoAbsenceAlert,
      },
      update: {
        schoolName, periodsPerDay,
        absentFullDayThreshold, excusedFullDayThreshold, weekDays, autoAbsenceAlert,
        // تغيير سياسة الاشتقاق يرفع رقم الإصدار — تُطبق على السجلات الجديدة فقط
        ...(policyChanged ? { policyVersion: { increment: 1 } } : {}),
      },
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: "حُفظت الإعدادات" };
  } catch {
    return fail("تعذر حفظ الإعدادات");
  }
}

export async function addTerm(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const name = String(formData.get("name") ?? "").trim();
    const start = String(formData.get("startDate") ?? "");
    const end = String(formData.get("endDate") ?? "");
    if (!name || !start || !end) return fail("كل الحقول مطلوبة");
    const year = await currentYear();
    await prisma.term.create({
      data: {
        name, academicYearId: year.id,
        startDate: new Date(`${start}T00:00:00.000Z`),
        endDate: new Date(`${end}T00:00:00.000Z`),
      },
    });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch {
    return fail("تعذر إضافة الفصل — ربما الاسم موجود");
  }
}

export async function deleteTerm(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    const used = await prisma.assessment.count({ where: { termId: id } });
    if (used) return fail("الفصل مرتبط بتقييمات — لا يمكن حذفه");
    await prisma.term.delete({ where: { id } });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch {
    return fail("تعذر حذف الفصل");
  }
}

// ============ الأعوام الدراسية ============

/** إنشاء عام دراسي — اختيارياً يُجعل حالاً فوراً */
export async function addAcademicYear(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const name = String(formData.get("name") ?? "").trim();
    const start = String(formData.get("startDate") ?? "");
    const end = String(formData.get("endDate") ?? "");
    const makeCurrent = formData.get("isCurrent") === "on";
    if (!name || !start || !end) return fail("كل الحقول مطلوبة");
    if (end <= start) return fail("تاريخ النهاية يجب أن يكون بعد البداية");
    await prisma.$transaction(async (tx) => {
      if (makeCurrent)
        await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      await tx.academicYear.create({
        data: {
          name, isCurrent: makeCurrent,
          startDate: new Date(`${start}T00:00:00.000Z`),
          endDate: new Date(`${end}T00:00:00.000Z`),
        },
      });
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: "أُنشئ العام الدراسي" };
  } catch {
    return fail("تعذر الإنشاء — ربما الاسم موجود");
  }
}

/** تعديل بيانات عام — الاسم والحدود الزمنية فقط */
export async function updateAcademicYear(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const start = String(formData.get("startDate") ?? "");
    const end = String(formData.get("endDate") ?? "");
    if (!id || !name || !start || !end) return fail("كل الحقول مطلوبة");
    if (end <= start) return fail("تاريخ النهاية يجب أن يكون بعد البداية");
    await prisma.academicYear.update({
      where: { id },
      data: {
        name,
        startDate: new Date(`${start}T00:00:00.000Z`),
        endDate: new Date(`${end}T00:00:00.000Z`),
      },
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: "حُدّث العام" };
  } catch {
    return fail("تعذر التحديث");
  }
}

/** تفعيل عام كـ«حالي» — يلغي الحالي السابق ذرّياً */
export async function setCurrentAcademicYear(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    const exists = await prisma.academicYear.findUnique({ where: { id } });
    if (!exists) return fail("العام غير موجود");
    await prisma.$transaction([
      prisma.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
      prisma.academicYear.update({ where: { id }, data: { isCurrent: true } }),
    ]);
    revalidatePath("/admin/settings");
    return { ok: true, message: `«${exists.name}» هو العام الحالي الآن` };
  } catch {
    return fail("تعذر التفعيل");
  }
}

/** حذف عام — فارغ تماماً فقط (لا صفوف/تسجيلات/إسنادات/فصول) */
export async function deleteAcademicYear(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    const y = await prisma.academicYear.findUnique({
      where: { id },
      include: { _count: { select: { classes: true, enrollments: true, assignments: true, terms: true } } },
    });
    if (!y) return fail("العام غير موجود");
    if (y.isCurrent) return fail("لا يمكن حذف العام الحالي — فعّل عاماً آخر أولاً");
    const c = y._count;
    if (c.classes || c.enrollments || c.assignments || c.terms)
      return fail("العام مرتبط ببيانات (صفوف/فصول/إسنادات) — لا يمكن حذفه");
    await prisma.academicYear.delete({ where: { id } });
    revalidatePath("/admin/settings");
    return { ok: true, message: "حُذف العام" };
  } catch {
    return fail("تعذر الحذف");
  }
}

/** تعليم يوم كدوام/إجازة في التقويم — ضبط التقويم شرط الإرسال الآلي */
export async function setCalendarDay(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const date = String(formData.get("date") ?? "");
    const isSchoolDay = formData.get("isSchoolDay") === "true";
    const note = String(formData.get("note") ?? "").trim() || null;
    if (!date) return fail("التاريخ مطلوب");
    await prisma.calendarDay.upsert({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      create: { date: new Date(`${date}T00:00:00.000Z`), isSchoolDay, note },
      update: { isSchoolDay, note },
    });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch {
    return fail("تعذر حفظ اليوم");
  }
}

export async function clearCalendarDay(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    await prisma.calendarDay.delete({ where: { id } });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch {
    return fail("تعذر حذف اليوم");
  }
}

// ============ إدارة الطلاب والصفوف ============

export async function editStudent(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    const fullName = String(formData.get("fullName") ?? "").trim();
    const classId = String(formData.get("classId") ?? "");
    const gender = String(formData.get("gender") ?? "").trim();
    const guardianName = String(formData.get("guardianName") ?? "").trim();
    const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
    if (!id || !fullName) return fail("الاسم مطلوب");
    await prisma.student.update({
      where: { id },
      data: {
        fullName,
        gender: gender || null,
        guardianName: guardianName || null,
        guardianPhone: guardianPhone || null,
      },
    });
    if (classId) {
      const year = await currentYear();
      const enrollment = await prisma.enrollment.findFirst({
        where: { studentId: id, academicYearId: year.id },
      });
      if (enrollment && enrollment.classId !== classId)
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { classId },
        });
    }
    revalidatePath("/admin/students");
    return { ok: true };
  } catch {
    return fail("تعذر تعديل الطالب");
  }
}

/** تعطيل/تفعيل طالب — لا حذف نهائي حفاظاً على السجل */
export async function toggleStudent(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    const s = await prisma.student.findUnique({ where: { id } });
    if (!s) return fail("الطالب غير موجود");
    await prisma.student.update({
      where: { id },
      data: { isActive: !s.isActive },
    });
    revalidatePath("/admin/students");
    return { ok: true };
  } catch {
    return fail("تعذر تحديث الطالب");
  }
}

const studentRecordCounts = {
  guardians: true, attendanceEntries: true, dailySummaries: true,
  behaviorEntries: true, notes: true, grades: true,
  evaluations: true, reportSnapshots: true, reportViews: true,
} as const;

/** حذف نهائي — للطالب بلا سجل تاريخي (قيود الصف فقط تُحذف معه)؛ من له تاريخ يُعطَّل عبر toggleStudent */
export async function deleteStudent(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    const s = await prisma.student.findUnique({
      where: { id },
      include: { _count: { select: studentRecordCounts } },
    });
    if (!s) return fail("الطالب غير موجود");
    const total = Object.values(s._count).reduce((a, b) => a + b, 0);
    if (total > 0)
      return fail("للطالب سجلات — استخدم الإيقاف بدلاً من الحذف حفاظاً على البيانات");
    await prisma.$transaction([
      prisma.enrollment.deleteMany({ where: { studentId: id } }),
      prisma.student.delete({ where: { id } }),
    ]);
    revalidatePath("/admin/students");
    return { ok: true, message: "حُذف الطالب نهائياً" };
  } catch {
    return fail("تعذر حذف الطالب");
  }
}

export async function updateClass(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const gradeId = String(formData.get("gradeId") ?? "").trim() || null;
    if (!id || !name || !displayName) return fail("الرمز والاسم المعروض مطلوبان");
    await prisma.classGroup.update({ where: { id }, data: { name, displayName, gradeId } });
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${id}`);
    revalidatePath("/admin/classes");
    return { ok: true };
  } catch {
    return fail("تعذر التعديل — ربما الرمز مستخدم لصف آخر");
  }
}

export async function setClassActive(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    const active = formData.get("active") === "1";
    const count = await prisma.enrollment.count({ where: { classId: id, student: { isActive: true } } });
    if (!active && count) return fail(`الصف يضم ${count} طالباً — انقلهم أولاً`);
    await prisma.classGroup.update({ where: { id }, data: { isActive: active } });
    revalidatePath("/admin/students");
    revalidatePath("/admin/classes");
    return { ok: true };
  } catch {
    return fail("تعذر تغيير حالة الصف");
  }
}

export async function moveClassStudents(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const fromId = String(formData.get("fromId") ?? "");
    const toId = String(formData.get("toId") ?? "");
    if (!fromId || !toId || fromId === toId) return fail("اختر صفاً وجهة مختلفاً");
    const year = await currentYear();
    const target = await prisma.classGroup.findFirst({
      where: { id: toId, isActive: true },
      select: { id: true },
    });
    if (!target) return fail("الصف الوجهة غير موجود أو معطّل");
    const res = await prisma.enrollment.updateMany({
      where: { classId: fromId, academicYearId: year.id },
      data: { classId: toId },
    });
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${fromId}`);
    revalidatePath(`/admin/students/${toId}`);
    revalidatePath("/admin/classes");
    return { ok: true, message: `نُقل ${res.count} طالباً` };
  } catch {
    return fail("تعذر نقل الطلاب");
  }
}

export async function deleteClass(formData: FormData): Promise<Result> {
  try {
    await requirePerm("students");
    const id = String(formData.get("id") ?? "");
    const c = await prisma.classGroup.findUnique({
      where: { id },
      include: {
        _count: {
          select: { students: true, timetableSlots: true, assignments: true, lessonSessions: true, assessments: true },
        },
      },
    });
    if (!c) return fail("الصف غير موجود");
    const history =
      c._count.students + c._count.timetableSlots + c._count.assignments +
      c._count.lessonSessions + c._count.assessments;
    if (history > 0) {
      // له سجل تاريخي — إلغاء تفعيل فقط حفاظاً على البيانات
      if (c.isActive) {
        await prisma.classGroup.update({ where: { id }, data: { isActive: false } });
        revalidatePath("/admin/students");
        revalidatePath("/admin/classes");
        return { ok: true, message: "الصف مرتبط بسجلات — تم إلغاء تفعيله بدلاً من الحذف" };
      }
      return fail("للصف سجل تاريخي — لا يمكن حذفه نهائياً");
    }
    await prisma.classGroup.delete({ where: { id } });
    revalidatePath("/admin/students");
    revalidatePath("/admin/classes");
    return { ok: true, message: "حُذف الصف نهائياً" };
  } catch {
    return fail("تعذر حذف الصف");
  }
}

// ============ إدارة المستخدمين ============

export async function toggleUser(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("admin");
    const id = String(formData.get("id") ?? "");
    if (id === actor.userId) return fail("لا يمكن تعطيل حسابك");
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) return fail("المستخدم غير موجود");
    await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
    // تعطيل الحساب يلغي جلساته فوراً
    if (u.isActive) await prisma.session.deleteMany({ where: { userId: id } });
    revalidatePath("/admin/users", "layout");
    return { ok: true };
  } catch {
    return fail("تعذر تحديث المستخدم");
  }
}

/** تعديل بيانات معلم/إداري — الاسم والهاتف (مفتاح ربط البوت) والمادة الافتراضية */
export async function updateStaffUser(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const userId = String(formData.get("userId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const defaultSubject = String(formData.get("defaultSubject") ?? "").trim() || null;
    if (!userId || !name) return fail("الاسم مطلوب");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, phone: true },
    });
    if (!user || user.role === "guardian") return fail("المستخدم غير موجود");

    // الرقم مفتاح ربط البوت — تغيّره يفسخ الربط القديم ليعيد المعلم الربط بالرقم الجديد
    const phoneChanged = (user.phone ?? null) !== phone;
    await prisma.user.update({
      where: { id: userId },
      data: { name, phone, ...(phoneChanged ? { telegramChatId: null } : {}) },
    });
    if (user.role === "teacher") {
      await prisma.teacherProfile.upsert({
        where: { userId },
        create: { userId, defaultSubject },
        update: { defaultSubject },
      });
    }
    revalidatePath("/admin/users", "layout");
    return {
      ok: true,
      message: phoneChanged
        ? "حُفظت البيانات — فُكّ ربط تيليجرام لتغيّر الرقم، وسيعيد المعلم ربطه"
        : "حُفظت بيانات المستخدم",
    };
  } catch {
    return fail("تعذر حفظ البيانات");
  }
}

/** إعادة تعيين كلمة مرور مستخدم — تُعرض مرة واحدة للإدارة */
export async function resetUserPassword(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("admin");
    const id = String(formData.get("userId") ?? "");
    if (!id) return fail("معرّف مفقود");
    if (id === actor.userId) return fail("غيّر كلمة مرورك من صفحتك");
    const newPassword = `Sch-${Math.random().toString(36).slice(2, 10)}!`;
    const hashed = await hashPassword(newPassword);
    const updated = await prisma.account.updateMany({
      where: { userId: id, providerId: "credential" },
      data: { password: hashed },
    });
    if (!updated.count)
      return fail("هذا المستخدم لم يعيّن كلمة مرور بعد — سلّمه رمز دعوة جديداً");
    await prisma.session.deleteMany({ where: { userId: id } });
    return { ok: true, message: `كلمة المرور الجديدة (مرة واحدة): ${newPassword}` };
  } catch {
    return fail("تعذر إعادة التعيين — المستخدم قد لا يملك كلمة مرور بعد");
  }
}

/** تغيير كلمة المرور الشخصية */
export async function changeOwnPassword(formData: FormData): Promise<Result> {
  try {
    const actor = await requireActor();
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    if (newPassword.length < 8) return fail("كلمة المرور 8 أحرف على الأقل");
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
    await prisma.user.update({
      where: { id: actor.userId },
      data: { mustChangePassword: false },
    });
    return { ok: true, message: "غُيّرت كلمة المرور" };
  } catch {
    return fail("تعذر التغيير — تحقق من كلمة المرور الحالية");
  }
}

// ============ استيراد الطلاب الجماعي ============

/** يقبل CSV (utf-8) بأعمدة name,class_name,parent_name,parent_phone — نفس تنسيق النظام القديم */
export async function importStudents(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("students");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) return fail("اختر ملفاً");

    const year = await currentYear();
    const classes = await prisma.classGroup.findMany({
      where: { academicYearId: year.id },
    });
    const classByName = new Map(
      classes.flatMap((c) => [
        [c.name, c.id] as const,
        ...(c.displayName ? [[c.displayName, c.id] as const] : []),
      ]),
    );

    // قالب Excel أو CSV — نفس مخطط الصفوف الناتج
    let rows: { row: number; name: string; className: string; parentName: string; parentPhone: string }[];
    const errors: string[] = [];
    if (/\.xlsx?$/i.test(file.name)) {
      const parsed = await parseStudentsXlsx(Buffer.from(await file.arrayBuffer()));
      rows = parsed.rows;
      errors.push(...parsed.errors);
    } else {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) return fail("الملف فارغ");
      const header = lines[0]!.split(",").map((h) => h.trim().replace(/^﻿/, ""));
      const idx = (k: string) => header.indexOf(k);
      if (idx("name") < 0) return fail("عمود name مفقود — التنسيق: name,class_name,parent_name,parent_phone");
      rows = lines.slice(1).map((line, i) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return {
          row: i + 2,
          name: cols[idx("name")] ?? "",
          className: idx("class_name") >= 0 ? (cols[idx("class_name")] ?? "") : "",
          parentName: idx("parent_name") >= 0 ? (cols[idx("parent_name")] ?? "") : "",
          parentPhone: idx("parent_phone") >= 0 ? (cols[idx("parent_phone")] ?? "") : "",
        };
      });
    }
    if (!rows.length && !errors.length) return fail("لا توجد صفوف صالحة في الملف");

    let created = 0, skipped = 0;
    const guardianPhones: Record<string, { name: string; phone: string }> = {};

    for (const r of rows) {
      if (!r.name) { skipped++; continue; }
      const classId = classByName.get(r.className);
      if (!classId) {
        skipped++;
        errors.push(`سطر ${r.row}: صف غير موجود "${r.className}"`);
        continue;
      }
      const student = await prisma.student.create({
        data: {
          fullName: r.name,
          ...(r.parentName ? { guardianName: r.parentName } : {}),
          ...(r.parentPhone ? { guardianPhone: r.parentPhone } : {}),
        },
      });
      await prisma.enrollment.create({
        data: { studentId: student.id, classId, academicYearId: year.id },
      });
      if (r.parentPhone) guardianPhones[student.id] = { name: r.parentName, phone: r.parentPhone };
      created++;
    }

    // حفظ أرقام أولياء الأمور لتوليد الدعوات لاحقاً
    if (Object.keys(guardianPhones).length) {
      await prisma.importBatch.create({
        data: {
          kind: "student_csv",
          status: "review",
          summary: { createdById: actor.userId, guardianPhones, fileName: file.name },
        },
      });
    }

    revalidatePath("/admin/students");
    return {
      ok: true,
      message: `أُدخل ${created} طالباً` +
        (skipped ? ` · تخطّي ${skipped}` : "") +
        (errors.length ? ` — ${errors.slice(0, 4).join(" | ")}` : ""),
    };
  } catch {
    return fail("تعذر الاستيراد — تحقق من تنسيق الملف");
  }
}

// ============ التقارير الأسبوعية ============

/** تشغيل التلخيص الأسبوعي يدوياً — يولّد اللقطات ويدرج الإرسال لكل ولي أمر */
export async function runWeeklyDigest(): Promise<Result> {
  try {
    const actor = await requirePerm("reports");
    const res = await generateWeeklyDigests({ requireCalendar: true });
    if (res.skippedNoCalendar)
      return fail("التقويم غير مهيأ — اضبط الفصول أو أيام التقويم أولاً في الإعدادات");
    if (!res.queued) return fail("لا أولياء أمور موثقين مرتبطين بطلاب");

    await prisma.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: "reports.weekly_digest",
        entityType: "WeeklyDigest",
        entityId: `${res.rangeStart}:${res.rangeEnd}`,
        after: { students: res.students, guardians: res.guardians, queued: res.queued },
      },
    });
    const managers = await reportManagerIds();
    await notifyUsers(managers, {
      type: "weekly_digest",
      title: "اكتمل توليد التلخيص الأسبوعي",
      body: `${res.students} طالباً · ${res.guardians} ولياً · ${res.queued} رسالة مدرجة (${res.rangeStart} → ${res.rangeEnd})`,
      href: "/admin/reports/outbox",
    });

    after(() => drainOutbox(50));
    revalidatePath("/admin/reports");
    revalidatePath("/admin/reports/snapshots");
    revalidatePath("/admin/reports/outbox");
    return {
      ok: true,
      message: `أُدرج ${res.queued} تلخيصاً وجارٍ إرسالها (${res.students} طالباً، ${res.rangeStart} → ${res.rangeEnd})`,
    };
  } catch {
    return fail("تعذر تشغيل التلخيص");
  }
}

// ============ إشعارات الغياب ============

/** إرسال تنبيه غياب لأولياء طالب — يُدرج في Outbox بمفتاح عدم تكرار */
export async function sendAbsenceAlert(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("attendance", "teacher");
    const studentId = String(formData.get("studentId") ?? "");
    const dateStr = String(formData.get("date") ?? "");
    if (!studentId || !dateStr) return fail("بيانات ناقصة");
    const date = new Date(`${dateStr}T00:00:00.000Z`);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        guardians: {
          where: { verified: true },
          include: { guardian: { include: { user: true } } },
        },
      },
    });
    if (!student) return fail("الطالب غير موجود");

    // المعلم ينبه طلابه فقط — تحقق من تسجيله سجلاً لذلك الطالب اليوم
    if (actor.role === "teacher") {
      const mine = await prisma.attendanceEntry.findFirst({
        where: {
          studentId,
          lessonSession: { date, teacherId: actor.userId },
        },
      });
      if (!mine) return fail("لا يمكنك تنبيه طالب خارج حصصك");
    }

    const summary = await prisma.dailySummary.findUnique({
      where: { studentId_date: { studentId, date } },
    });
    if (!summary || (summary.status !== "absent" && summary.status !== "excused"))
      return fail("الطالب ليس غائباً في هذا اليوم");

    const guardians = student.guardians;
    if (!guardians.length) return fail("لا يوجد ولي أمر موثق لهذا الطالب");

    let queued = 0;
    for (const g of guardians) {
      const chatId = g.guardian.user.telegramChatId;
      const channel = chatId ? "telegram" : "portal";
      await prisma.outboxEvent.upsert({
        where: { idempotencyKey: `absence:${studentId}:${dateStr}:g:${g.guardianId}` },
        create: {
          type: "absence_alert",
          channel,
          idempotencyKey: `absence:${studentId}:${dateStr}:g:${g.guardianId}`,
          payload: {
            studentId,
            guardianId: g.guardianId,
            studentName: student.fullName,
            date: dateStr,
            status: summary.status,
            telegramChatId: chatId,
          },
        },
        update: {},
      });
      queued++;
    }
    // إشعار داخلي للجرس — لكل ولي أمر له حساب
    await notifyUsers(
      guardians.map((g) => g.guardian.userId),
      {
        type: "absence_alert",
        title: `غياب: ${student.fullName}`,
        body: `${summary.status === "excused" ? "غياب بعذر" : "غياب"} بتاريخ ${dateStr}`,
        href: "/parent",
      },
    );
    after(() => drainOutbox(10));
    return { ok: true, message: `أُدرج ${queued} تنبيهاً وجارٍ إرسالها` };
  } catch {
    return fail("تعذر إرسال التنبيه");
  }
}

// ============ الإداريون المفوَّضون (staff) ============

/** إنشاء حساب إداري بصلاحيات مخصّصة — بيانات الدخول تُعرض مرة واحدة */
export async function createStaffAccountAction(
  formData: FormData,
): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  try {
    await requireRole("admin");
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const perms = formData.getAll("perms").map(String).filter((p) =>
      ADMIN_PERMS.some((x) => x.key === p));
    if (!name) return fail("الاسم مطلوب");
    if (!perms.length) return fail("اختر صلاحية واحدة على الأقل");

    const base = "s" + (phone?.replace(/\D/g, "").slice(-6) || Math.random().toString(36).slice(2, 8));
    let username = base;
    for (let i = 2; await prisma.user.findUnique({ where: { username } }); i++)
      username = `${base}_${i}`;

    const password = generatePassword();
    const res = await auth.api.signUpEmail({
      body: {
        email: `${username}@internal.school`,
        password,
        name,
        username,
      },
    });
    const userId = (res as { user?: { id: string } }).user?.id;
    if (!userId) return fail("تعذر إنشاء الحساب");
    await prisma.user.update({
      where: { id: userId },
      data: { role: "staff", phone, permissions: perms, mustChangePassword: true },
    });
    revalidatePath("/admin/users", "layout");
    return { ok: true, message: `أُنشئ الحساب — المستخدم: ${username} · كلمة المرور: ${password}` };
  } catch {
    return fail("تعذر إنشاء حساب الإداري");
  }
}

/** تحديث صلاحيات إداري مفوَّض — المدير فقط، ولا تمس دوراً آخر */
export async function setStaffPermissionsAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("admin");
    const userId = String(formData.get("userId") ?? "");
    const perms = formData.getAll("perms").map(String).filter((p) =>
      ADMIN_PERMS.some((x) => x.key === p));
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!u || u.role !== "staff") return fail("المستخدم ليس إدارياً مفوَّضاً");
    if (userId === actor.userId) return fail("لا يمكن تعديل صلاحياتك بنفسك");
    await prisma.user.update({ where: { id: userId }, data: { permissions: perms } });
    // تحديث الصلاحيات يُسقط الجلسات الحالية لتسري فوراً عند دخوله التالي
    await prisma.session.deleteMany({ where: { userId } });
    revalidatePath("/admin/users", "layout");
    return { ok: true, message: "حُدّثت الصلاحيات — تسري عند دخوله التالي" };
  } catch {
    return fail("تعذر تحديث الصلاحيات");
  }
}

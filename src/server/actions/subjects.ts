"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@app/db";
import { requirePerm } from "../session";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const refresh = () => {
  revalidatePath("/admin/subjects");
  revalidatePath("/admin/schedule");
};

async function currentYear() {
  const y = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!y) throw new Error("لا يوجد عام دراسي حالي");
  return y;
}

/** إعادة تسمية مادة */
export async function renameSubjectAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    if (!id || !name) return fail("اسم المادة مطلوب");
    const code = String(formData.get("code") ?? "").trim() || null;
    const color = String(formData.get("color") ?? "").trim() || null;
    await prisma.subject.update({ where: { id }, data: { name, code, color } });
    refresh();
    return { ok: true, message: "حُدّث اسم المادة" };
  } catch {
    return fail("تعذر التحديث — ربما الاسم مستخدم لمادة أخرى");
  }
}

/** تعطيل/تفعيل مادة — المعطّلة تختفي من كل المحددات */
export async function toggleSubjectAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const subject = await prisma.subject.findUnique({ where: { id } });
    if (!subject) return fail("المادة غير موجودة");
    await prisma.subject.update({ where: { id }, data: { isActive: !subject.isActive } });
    refresh();
    return { ok: true, message: subject.isActive ? "عُطّلت المادة" : "فُعّلت المادة" };
  } catch {
    return fail("تعذر تغيير الحالة");
  }
}

/** إسناد مادة لمعلم في صف — بدون حاجة لحصة جدول */
export async function assignSubjectAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const teacherId = String(formData.get("teacherId") ?? "");
    const classId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    if (!teacherId || !classId || !subjectId) return fail("كل الحقول مطلوبة");
    const year = await currentYear();
    await prisma.teachingAssignment.upsert({
      where: {
        teacherId_classId_subjectId_academicYearId: {
          teacherId, classId, subjectId, academicYearId: year.id,
        },
      },
      create: { teacherId, classId, subjectId, academicYearId: year.id },
      update: { isActive: true },
    });
    refresh();
    return { ok: true, message: "أُسندت المادة للمعلم" };
  } catch {
    return fail("تعذر الإسناد");
  }
}

/**
 * خلية مصفوفة التغطية: تعيين معلم واحد لـ(صف × مادة) أو مسحها.
 * تعطّل إسنادات المعلمين الآخرين لنفس الثنائية — توزيع الجدولة يفترض معلماً واحداً.
 */
export async function setCellAssignmentAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const classId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const teacherId = String(formData.get("teacherId") ?? "");
    if (!classId || !subjectId) return fail("حقول ناقصة");
    const year = await currentYear();
    await prisma.$transaction(async (tx) => {
      await tx.teachingAssignment.updateMany({
        where: {
          classId, subjectId, academicYearId: year.id, isActive: true,
          ...(teacherId ? { teacherId: { not: teacherId } } : {}),
        },
        data: { isActive: false },
      });
      if (teacherId) {
        await tx.teachingAssignment.upsert({
          where: {
            teacherId_classId_subjectId_academicYearId: {
              teacherId, classId, subjectId, academicYearId: year.id,
            },
          },
          create: { teacherId, classId, subjectId, academicYearId: year.id },
          update: { isActive: true },
        });
      }
    });
    refresh();
    revalidatePath("/admin/subjects/coverage");
    return { ok: true, message: "حُدّث الإسناد" };
  } catch {
    return fail("تعذر التحديث");
  }
}

/** إلغاء إسناد — تعطيل لا حذف (يحفظ بيانات الخطط والدرجات السابقة) */
export async function unassignSubjectAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    await prisma.teachingAssignment.update({ where: { id }, data: { isActive: false } });
    refresh();
    return { ok: true, message: "أُلغي الإسناد" };
  } catch {
    return fail("تعذر إلغاء الإسناد");
  }
}

/** حذف نهائي لإسناد معطّل — لا يمس الخطط أو الحضور (لا يرتبطان به مباشرة) */
export async function deleteAssignmentAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const a = await prisma.teachingAssignment.findUnique({ where: { id } });
    if (!a) return fail("الإسناد غير موجود");
    if (a.isActive) return fail("ألغِ الإسناد أولاً قبل حذفه نهائياً");
    await prisma.teachingAssignment.delete({ where: { id } });
    refresh();
    return { ok: true, message: "حُذف الإسناد نهائياً" };
  } catch {
    return fail("تعذر الحذف — قد ترتبط به سجلات أخرى");
  }
}

/** إعادة تفعيل إسناد معطّل */
export async function reassignSubjectAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    await prisma.teachingAssignment.update({ where: { id }, data: { isActive: true } });
    refresh();
    return { ok: true, message: "أُعيد تفعيل الإسناد" };
  } catch {
    return fail("تعذر إعادة التفعيل");
  }
}

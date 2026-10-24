"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@app/db";
import { weekStartOf } from "@app/core";
import { requirePerm } from "../session";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const refresh = () => {
  revalidatePath("/admin/duties");
  revalidatePath("/teacher");
};

/** خلية شبكة الإشراف: تعيين معلم لـ(موقع × يوم × أسبوع) أو مسحها */
export async function setDutyAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("duties");
    const locationId = String(formData.get("locationId") ?? "");
    const dayOfWeek = Number(formData.get("dayOfWeek"));
    const weekStart = new Date(String(formData.get("weekStart") ?? ""));
    const teacherId = String(formData.get("teacherId") ?? "");
    if (!locationId || isNaN(dayOfWeek) || isNaN(weekStart.getTime())) return fail("حقول ناقصة");
    const where = { weekStart_dayOfWeek_locationId: { weekStart, dayOfWeek, locationId } };
    if (!teacherId) {
      // مسح المعلم: يُبقي الاسم النصي إن وُجد (مناوب بلا حساب)، وإلا يحذف الخلية
      const row = await prisma.dutyAssignment.findUnique({ where });
      if (row?.label) await prisma.dutyAssignment.update({ where, data: { teacherId: null } });
      else await prisma.dutyAssignment.deleteMany({ where: where.weekStart_dayOfWeek_locationId });
    } else {
      // ربط معلم يبدّل الاسم النصي
      await prisma.dutyAssignment.upsert({
        where,
        create: { weekStart, dayOfWeek, locationId, teacherId, label: null },
        update: { teacherId, label: null },
      });
    }
    refresh();
    return { ok: true, message: "حُدّثت المناوبة" };
  } catch {
    return fail("تعذر التحديث");
  }
}

/** ينسخ مناوبات أسبوع سابق إلى الأسبوع المعروض — يبدّل الموجود */
export async function copyWeekDutiesAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("duties");
    const weekStart = new Date(String(formData.get("weekStart") ?? ""));
    if (isNaN(weekStart.getTime())) return fail("أسبوع غير صالح");
    const wk = weekStartOf(weekStart);
    const prev = new Date(wk);
    prev.setUTCDate(prev.getUTCDate() - 7);
    const src = await prisma.dutyAssignment.findMany({
      where: { weekStart: prev },
      include: { location: { select: { isActive: true } } },
    });
    if (!src.length) return fail("لا مناوبات في الأسبوع السابق");
    for (const d of src.filter((x) => x.location.isActive))
      await prisma.dutyAssignment.upsert({
        where: {
          weekStart_dayOfWeek_locationId: {
            weekStart: wk, dayOfWeek: d.dayOfWeek, locationId: d.locationId,
          },
        },
        create: { weekStart: wk, dayOfWeek: d.dayOfWeek, locationId: d.locationId, teacherId: d.teacherId, label: d.label },
        update: { teacherId: d.teacherId, label: d.label },
      });
    refresh();
    return { ok: true, message: `نُسخت ${src.length} مناوبة من الأسبوع الماضي` };
  } catch {
    return fail("تعذر النسخ");
  }
}

// ===== إدارة المواقع =====

export async function saveDutyLocationAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("duties");
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const group = String(formData.get("group") ?? "").trim() || null;
    const sortOrder = Number(formData.get("sortOrder")) || 0;
    if (!name) return fail("اسم الموقع مطلوب");
    if (id) {
      await prisma.dutyLocation.update({ where: { id }, data: { name, group, sortOrder } });
    } else {
      await prisma.dutyLocation.create({ data: { name, group, sortOrder } });
    }
    refresh();
    return { ok: true, message: id ? "حُدّث الموقع" : "أُضيف الموقع" };
  } catch {
    return fail("تعذر الحفظ");
  }
}

export async function toggleDutyLocationAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("duties");
    const id = String(formData.get("id") ?? "");
    const l = await prisma.dutyLocation.findUnique({ where: { id } });
    if (!l) return fail("الموقع غير موجود");
    await prisma.dutyLocation.update({ where: { id }, data: { isActive: !l.isActive } });
    refresh();
    return { ok: true, message: l.isActive ? "عُطّل الموقع" : "فُعّل الموقع" };
  } catch {
    return fail("تعذر التبديل");
  }
}

/** حذف نهائي للموقع — مرفوض إن كانت له مناوبات مسجلة */
export async function deleteDutyLocationAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("duties");
    const id = String(formData.get("id") ?? "");
    const refs = await prisma.dutyAssignment.count({ where: { locationId: id } });
    if (refs) return fail(`لا يمكن الحذف — ${refs} مناوبة مرتبطة (عطّله بدلاً من ذلك)`);
    await prisma.dutyLocation.delete({ where: { id } });
    refresh();
    return { ok: true, message: "حُذف الموقع" };
  } catch {
    return fail("تعذر الحذف");
  }
}

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

/**
 * تعبئة تلقائية عادلة لشبكة المناوبة:
 * - الخلية تذهب للأقل مناوبات هذا الأسبوع، غير المناوب في ذلك اليوم،
 *   ويفضَّل من لم يمناوب على الموقع نفسه بعد (تدوير)
 * - mode=fill   : يملأ الخانات الفارغة فقط (يحترم اليدوي والأسماء النصية)
 * - mode=replace: يمسح شبكة الأسبوع كلها ثم يعيد التوزيع
 */
export async function autoFillDutiesAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("duties");
    const weekStart = weekStartOf(new Date(String(formData.get("weekStart") ?? "")));
    if (isNaN(weekStart.getTime())) return fail("أسبوع غير صالح");
    const replace = formData.get("mode") === "replace";

    const [settings, locations, users] = await Promise.all([
      prisma.schoolSettings.findUnique({ where: { id: "school" } }),
      prisma.dutyLocation.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.user.findMany({
        where: { role: { in: ["teacher", "staff", "admin"] }, isActive: true },
        select: { id: true },
      }),
    ]);
    const weekDays = (settings?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort();
    if (!locations.length) return fail("لا مواقع إشراف نشطة");
    if (!users.length) return fail("لا مناوبين نشطين");

    if (replace) await prisma.dutyAssignment.deleteMany({ where: { weekStart } });

    // الخانات المحجوزة: مرتبطة بمستخدم أو باسم نصي (بقايا «البرنامج المدرسي»)
    const existing = await prisma.dutyAssignment.findMany({
      where: { weekStart },
      select: { locationId: true, dayOfWeek: true, teacherId: true, label: true },
    });
    const filled = new Set(existing.filter((e) => e.teacherId || e.label).map((e) => `${e.locationId}|${e.dayOfWeek}`));

    // خلط أولي لكسر التعادل عشوائياً بين أصحاب الحمل المتساوي
    const pool = users.map((u) => u.id).sort(() => Math.random() - 0.5);
    const weekCount = new Map(pool.map((id) => [id, 0]));
    const dayTaken = new Set<string>();
    const locTaken = new Set<string>();
    // الاختيارات اليدوية الموجودة تُحسب ضمن العدالة
    for (const e of existing) {
      if (!e.teacherId) continue;
      weekCount.set(e.teacherId, (weekCount.get(e.teacherId) ?? 0) + 1);
      dayTaken.add(`${e.teacherId}|${e.dayOfWeek}`);
      locTaken.add(`${e.teacherId}|${e.locationId}`);
    }

    const load = (id: string) => weekCount.get(id) ?? 0;
    let assigned = 0;
    for (const d of weekDays) {
      for (const l of locations) {
        if (filled.has(`${l.id}|${d}`)) continue;
        const pick =
          pool
            .filter((id) => !dayTaken.has(`${id}|${d}`))
            .sort(
              (a, b) =>
                load(a) - load(b) ||
                Number(locTaken.has(`${a}|${l.id}`)) - Number(locTaken.has(`${b}|${l.id}`))
            )[0] ??
          // الكل مناوب هذا اليوم (مواقع > مناوبين) — يُسند للأقل حملاً إجمالاً
          pool.slice().sort((a, b) => load(a) - load(b))[0];
        if (!pick) break;
        await prisma.dutyAssignment.upsert({
          where: { weekStart_dayOfWeek_locationId: { weekStart, dayOfWeek: d, locationId: l.id } },
          create: { weekStart, dayOfWeek: d, locationId: l.id, teacherId: pick },
          update: { teacherId: pick, label: null },
        });
        weekCount.set(pick, load(pick) + 1);
        dayTaken.add(`${pick}|${d}`);
        locTaken.add(`${pick}|${l.id}`);
        assigned++;
      }
    }
    refresh();
    return { ok: true, message: assigned ? `عُبّئت ${assigned} خانة — راجع الشبكة وعدّل ما تشاء` : "كل الخانات معبّأة" };
  } catch {
    return fail("تعذرت التعبئة التلقائية");
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

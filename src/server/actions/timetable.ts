"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@app/db";
import { requirePerm } from "../session";
import {
  executeGenerationJob,
  publishGeneratedTimetable,
  mergeConstraints,
  type ConstraintConfig,
  type ConstraintKind,
} from "@app/core";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const refresh = () => {
  revalidatePath("/admin/timetable");
  revalidatePath("/admin/timetable/setup");
  revalidatePath("/admin/assignments");
};

async function currentYear() {
  const y = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!y) throw new Error("لا يوجد عام دراسي حالي");
  return y;
}

// ===== كوتا المواد لكل صف =====
export async function setQuotaAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const subjectId = String(formData.get("subjectId") ?? "");
    const gradeId = String(formData.get("gradeId") ?? "");
    const weeklyPeriods = Math.max(0, Number(formData.get("weeklyPeriods") ?? 0));
    if (!subjectId || !gradeId) return fail("المادة والصف مطلوبان");
    if (weeklyPeriods === 0) {
      await prisma.subjectGradeQuota.deleteMany({ where: { subjectId, gradeId } });
    } else {
      await prisma.subjectGradeQuota.upsert({
        where: { subjectId_gradeId: { subjectId, gradeId } },
        create: { subjectId, gradeId, weeklyPeriods },
        update: { weeklyPeriods },
      });
    }
    refresh();
    return { ok: true, message: weeklyPeriods ? `ضُبط النصاب: ${weeklyPeriods} حصص` : "حُذفت الكوتا" };
  } catch {
    return fail("تعذر حفظ الكوتا");
  }
}

// ===== تعريفات فترات اليوم =====
export async function addDayPeriodDefAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const dayOfWeek = Number(formData.get("dayOfWeek"));
    const index = Number(formData.get("index"));
    const label = String(formData.get("label") ?? "").trim() || `خانة ${index}`;
    const isBreak = formData.get("isBreak") === "on";
    const start = String(formData.get("start") ?? "").trim() || null;
    const end = String(formData.get("end") ?? "").trim() || null;
    if (isNaN(dayOfWeek) || isNaN(index) || index < 0) return fail("قيم غير صالحة");
    await prisma.dayPeriodDef.upsert({
      where: { dayOfWeek_index: { dayOfWeek, index } },
      create: { dayOfWeek, index, label, isBreak, start, end },
      update: { label, isBreak, start, end },
    });
    refresh();
    return { ok: true, message: "حُفظت الخانة" };
  } catch {
    return fail("تعذر حفظ الخانة");
  }
}

/** يحدّث خانة فترة موجودة (تسمية/وقت/استراحة) — الفهرس واليوم ثابتان */
export async function updateDayPeriodDefAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const label = String(formData.get("label") ?? "").trim();
    const start = String(formData.get("start") ?? "").trim() || null;
    const end = String(formData.get("end") ?? "").trim() || null;
    const isBreak = formData.get("isBreak") === "on";
    if (!id || !label) return fail("حقول ناقصة");
    await prisma.dayPeriodDef.update({ where: { id }, data: { label, start, end, isBreak } });
    refresh();
    return { ok: true, message: "حُدّثت الخانة" };
  } catch {
    return fail("تعذر التحديث");
  }
}

/** أيام الدوام — مصدرها SchoolSettings.weekDays؛ يقود الشبكات والكشوف */
export async function saveWeekDaysAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => formData.get(`day${d}`) === "on");
    if (!days.length) return fail("اختر يوماً واحداً على الأقل");
    await prisma.schoolSettings.upsert({
      where: { id: "school" },
      create: { id: "school", schoolName: "مدرسة الجسر الحلقة الثانية بنين", weekDays: days },
      update: { weekDays: days },
    });
    refresh();
    return { ok: true, message: `أيام الدوام: ${days.length}` };
  } catch {
    return fail("تعذر الحفظ");
  }
}

/** ينسخ تعريفات فترات يوم لكل أيام الدوام الأخرى — يحدّث المواضع المطابقة ويضيف الناقصة */
export async function copyDayPeriodsToAllAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const fromDay = Number(formData.get("dayOfWeek"));
    if (isNaN(fromDay)) return fail("يوم غير صالح");
    const [settings, defs] = await Promise.all([
      prisma.schoolSettings.findUnique({ where: { id: "school" } }),
      prisma.dayPeriodDef.findMany({ where: { dayOfWeek: fromDay }, orderBy: { index: "asc" } }),
    ]);
    if (!defs.length) return fail("لا خانات في هذا اليوم لنسخها");
    const others = (settings?.weekDays ?? []).filter((d) => d !== fromDay);
    for (const d of others)
      for (const p of defs)
        await prisma.dayPeriodDef.upsert({
          where: { dayOfWeek_index: { dayOfWeek: d, index: p.index } },
          create: { dayOfWeek: d, index: p.index, label: p.label, start: p.start, end: p.end, isBreak: p.isBreak },
          update: { label: p.label, start: p.start, end: p.end, isBreak: p.isBreak },
        });
    refresh();
    return { ok: true, message: `نُسخت ${defs.length} خانة إلى ${others.length} أيام` };
  } catch {
    return fail("تعذر النسخ");
  }
}

export async function deleteDayPeriodDefAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    await prisma.dayPeriodDef.delete({ where: { id } });
    refresh();
    return { ok: true, message: "حُذفت الخانة" };
  } catch {
    return fail("تعذر الحذف — قد تكون مستخدمة في جدول مولّد");
  }
}

// ===== قيود المحرك =====
const KINDS: ConstraintKind[] = [
  "teacherMaxDaily", "maxPerDay", "sameDayRepeat", "consecutive", "minDaysPerWeek",
  "teacherEveryDay", "teacherMaxConsec", "preferEarlySubject", "subjectBlock",
  "dailyBalance", "fairLastPeriod",
];

export async function saveConstraintsAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const current = mergeConstraints(
      (await prisma.schoolSettings.findUnique({ where: { id: "school" } }))?.constraintsJson,
    );
    const config = { ...current } as ConstraintConfig;
    for (const k of KINDS) {
      const mode = String(formData.get(`${k}.mode`) ?? "off");
      const weight = Number(formData.get(`${k}.weight`) ?? 0);
      const rawValue = formData.get(`${k}.value`);
      const value = rawValue === null || rawValue === "" ? undefined : Number(rawValue);
      config[k] = {
        mode: mode === "hard" || mode === "soft" ? mode : "off",
        weight: isNaN(weight) ? 0 : Math.max(0, weight),
        ...(value !== undefined && !isNaN(value) ? { value } : {}),
      };
    }
    await prisma.schoolSettings.upsert({
      where: { id: "school" },
      create: { id: "school", schoolName: "مدرسة الجسر الحلقة الثانية بنين", constraintsJson: JSON.stringify(config) },
      update: { constraintsJson: JSON.stringify(config) },
    });
    refresh();
    return { ok: true, message: "حُفظت قيود المحرك" };
  } catch {
    return fail("تعذر حفظ القيود");
  }
}

export async function applyConstraintPresetAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const json = String(formData.get("json") ?? "");
    JSON.parse(json); // تحقق
    await prisma.schoolSettings.upsert({
      where: { id: "school" },
      create: { id: "school", schoolName: "مدرسة الجسر الحلقة الثانية بنين", constraintsJson: json },
      update: { constraintsJson: json },
    });
    refresh();
    return { ok: true, message: "طُبّق القالب" };
  } catch {
    return fail("قالب غير صالح");
  }
}

// ===== توفر المعلم / حظر المادة (شبكة خانات) =====
export async function saveTeacherUnavailAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const teacherId = String(formData.get("teacherId") ?? "");
    const keys = JSON.parse(String(formData.get("keys") ?? "[]")) as { dayOfWeek: number; periodIndex: number }[];
    if (!teacherId) return fail("المعلم مطلوب");
    await prisma.$transaction([
      prisma.teacherAvailability.deleteMany({ where: { teacherId } }),
      prisma.teacherAvailability.createMany({ data: keys.map((k) => ({ teacherId, ...k })) }),
    ]);
    refresh();
    return { ok: true, message: `حُفظت ${keys.length} خانة محظورة` };
  } catch {
    return fail("تعذر حفظ التوفر");
  }
}

export async function saveTeacherLimitsAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const teacherId = String(formData.get("teacherId") ?? "");
    const num = (n: string) => {
      const v = formData.get(n);
      const i = Number(v);
      return v === null || v === "" || isNaN(i) || i <= 0 ? null : i;
    };
    await prisma.teacherProfile.update({
      where: { userId: teacherId },
      data: {
        specialization: String(formData.get("specialization") ?? "").trim() || null,
        employeeNo: String(formData.get("employeeNo") ?? "").trim() || null,
        color: String(formData.get("color") ?? "").trim() || "#3b82f6",
        weeklyLessons: num("weeklyLessons") ?? 22,
        maxDailyLessons: num("maxDailyLessons"),
        maxConsecutive: num("maxConsecutive"),
        maxWorkingDays: num("maxWorkingDays"),
        avoidLastPeriod: formData.get("avoidLastPeriod") === "on",
      },
    });
    refresh();
    return { ok: true, message: "حُفظت حدود المعلم" };
  } catch {
    return fail("تعذر الحفظ");
  }
}

export async function saveSubjectBlocksAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const subjectId = String(formData.get("subjectId") ?? "");
    const keys = JSON.parse(String(formData.get("keys") ?? "[]")) as { dayOfWeek: number; periodIndex: number }[];
    if (!subjectId) return fail("المادة مطلوبة");
    await prisma.$transaction([
      prisma.subjectUnavailability.deleteMany({ where: { subjectId } }),
      prisma.subjectUnavailability.createMany({ data: keys.map((k) => ({ subjectId, ...k })) }),
    ]);
    refresh();
    return { ok: true, message: `حُفظت ${keys.length} خانة محظورة` };
  } catch {
    return fail("تعذر حفظ الحظر");
  }
}

/** خصائص المادة للجدولة: حد يومي/أدنى أيام/تفضيل مبكر */
export async function saveSubjectRulesAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const subjectId = String(formData.get("subjectId") ?? "");
    const num = (n: string) => {
      const v = formData.get(n);
      const i = Number(v);
      return v === null || v === "" || isNaN(i) || i <= 0 ? null : i;
    };
    await prisma.subject.update({
      where: { id: subjectId },
      data: {
        maxPerDay: num("maxPerDay"),
        minDaysPerWeek: num("minDaysPerWeek"),
        preferEarly: formData.get("preferEarly") === "on",
      },
    });
    refresh();
    return { ok: true, message: "حُفظت قواعد المادة" };
  } catch {
    return fail("تعذر الحفظ");
  }
}

// ===== التوليد والنشر =====
export async function startGenerationAction(): Promise<Result> {
  try {
    await requirePerm("timetable");
    const running = await prisma.timetableJob.findFirst({
      where: { status: { in: ["PENDING", "RUNNING"] } },
    });
    if (running) return { ok: true, message: running.id };
    const year = await currentYear();
    const job = await prisma.timetableJob.create({ data: { status: "PENDING" } });
    after(async () => {
      try {
        await executeGenerationJob(job.id, year.id);
      } catch (e) {
        console.error("generation job failed", e);
      }
    });
    return { ok: true, message: job.id };
  } catch {
    return fail("تعذر بدء التوليد");
  }
}

export async function publishTimetableAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    const pub = await publishGeneratedTimetable(id, new Date());
    refresh();
    return { ok: true, message: `نُشر الجدول — ${pub.slots} خانة فعّالة فوراً` };
  } catch {
    return fail("تعذر النشر");
  }
}

export async function archiveTimetableAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    await prisma.generatedTimetable.update({ where: { id }, data: { status: "ARCHIVED" } });
    refresh();
    return { ok: true, message: "أُرشف الجدول" };
  } catch {
    return fail("تعذر الأرشفة");
  }
}

export async function deleteDraftTimetableAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const tt = await prisma.generatedTimetable.findUnique({ where: { id } });
    if (!tt) return fail("الجدول غير موجود");
    if (tt.status === "PUBLISHED") return fail("لا يمكن حذف الجدول المنشور — أرشفه بدلًا من ذلك");
    await prisma.generatedTimetable.delete({ where: { id } });
    refresh();
    return { ok: true, message: "حُذفت المسودة" };
  } catch {
    return fail("تعذر الحذف");
  }
}

// ===== المستويات الصفية والشعب =====

export async function addGradeAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const name = String(formData.get("name") ?? "").trim();
    const order = Number(formData.get("order"));
    if (!name || isNaN(order)) return fail("الاسم والترتيب مطلوبان");
    await prisma.gradeLevel.create({ data: { name, order } });
    refresh();
    return { ok: true, message: "أُضيف المستوى" };
  } catch {
    return fail("تعذر الإضافة — ربما الاسم مكرر");
  }
}

export async function updateGradeAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const order = Number(formData.get("order"));
    if (!id || !name || isNaN(order)) return fail("حقول ناقصة");
    await prisma.gradeLevel.update({ where: { id }, data: { name, order } });
    refresh();
    return { ok: true, message: "حُدّث المستوى" };
  } catch {
    return fail("تعذر التحديث");
  }
}

export async function deleteGradeAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const refs = await prisma.classGroup.count({ where: { gradeId: id } });
    if (refs) return fail(`لا يمكن الحذف — ${refs} شعبة مرتبطة به`);
    await prisma.gradeLevel.delete({ where: { id } });
    refresh();
    return { ok: true, message: "حُذف المستوى" };
  } catch {
    return fail("تعذر الحذف");
  }
}

/** يضيف شعبة لمستوى — يولّد الاسم والاسم المعروض من ترقيم الشعبة تلقائياً */
export async function addClassAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const gradeId = String(formData.get("gradeId") ?? "");
    const section = Number(formData.get("section"));
    const grade = await prisma.gradeLevel.findUnique({ where: { id: gradeId } });
    if (!grade || isNaN(section) || section < 1) return fail("المستوى ورقم الشعبة مطلوبان");
    const year = await currentYear();
    const name = `${grade.order}-${section}`;
    const displayName = `${grade.name} - شعبة ${section}`;
    const dup = await prisma.classGroup.findFirst({
      where: { academicYearId: year.id, gradeId, name },
    });
    if (dup?.isActive) return fail(`الشعبة ${displayName} موجودة`);
    if (dup) {
      await prisma.classGroup.update({ where: { id: dup.id }, data: { isActive: true } });
      refresh();
      return { ok: true, message: `أُعيد تفعيل ${displayName}` };
    }
    await prisma.classGroup.create({ data: { name, displayName, gradeId, academicYearId: year.id } });
    refresh();
    revalidatePath("/admin/subjects");
    return { ok: true, message: `أُضيفت ${displayName}` };
  } catch {
    return fail("تعذر الإضافة");
  }
}

export async function renameClassAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (!id || !displayName) return fail("حقول ناقصة");
    await prisma.classGroup.update({ where: { id }, data: { displayName } });
    refresh();
    return { ok: true, message: "حُدّث الاسم" };
  } catch {
    return fail("تعذر التحديث");
  }
}

export async function toggleClassAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const c = await prisma.classGroup.findUnique({ where: { id } });
    if (!c) return fail("الشعبة غير موجودة");
    await prisma.classGroup.update({ where: { id }, data: { isActive: !c.isActive } });
    refresh();
    revalidatePath("/admin/subjects");
    return { ok: true, message: c.isActive ? "عُطّلت الشعبة" : "فُعّلت الشعبة" };
  } catch {
    return fail("تعذر التبديل");
  }
}

/** حذف نهائي للشعبة — مرفوض إن وُجدت أي مراجع (تسجيلات/إسنادات/خانات) */
export async function deleteClassAction(formData: FormData): Promise<Result> {
  try {
    await requirePerm("timetable");
    const id = String(formData.get("id") ?? "");
    const [enrollments, assignments, slots] = await Promise.all([
      prisma.enrollment.count({ where: { classId: id } }),
      prisma.teachingAssignment.count({ where: { classId: id } }),
      prisma.timetableSlot.count({ where: { classId: id } }),
    ]);
    const total = enrollments + assignments + slots;
    if (total) return fail(`لا يمكن الحذف — ${total} مرجعاً مرتبطاً (عطّلها بدلاً من ذلك)`);
    await prisma.classGroup.delete({ where: { id } });
    refresh();
    revalidatePath("/admin/subjects");
    return { ok: true, message: "حُذفت الشعبة نهائياً" };
  } catch {
    return fail("تعذر الحذف");
  }
}

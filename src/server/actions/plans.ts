"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@app/db";
import {
  savePlan, submitPlan, unsubmitPlan, publishClassPlan,
  type PlanEntryInput,
} from "@app/core";

/** يجمع بنود الأسبوع من حقول النموذج المسماة t_{w}/b_{w}/p_{w}/q_{w}/n_{w} */
function entriesFromForm(formData: FormData): PlanEntryInput[] {
  const out: PlanEntryInput[] = [];
  for (let w = 0; w <= 6; w++) {
    const get = (k: string) => String(formData.get(`${k}_${w}`) ?? "").trim();
    const e: PlanEntryInput = {
      weekday: w,
      lessonTitle: get("t"), textbook: get("b"),
      platforms: get("p"), tests: get("q"), notes: get("n"),
    };
    if (e.lessonTitle || e.textbook || e.platforms || e.tests || e.notes)
      out.push(e);
  }
  return out;
}
import { drainOutbox } from "@/lib/jobs/drain";
import { requirePerm, asAdmin } from "../session";
import { notifyUsers } from "../notify";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

/** حفظ مسودة الخطة — المعلم لإسناده أو الإدارة لأي إسناد */
export async function savePlanAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("plans", "teacher");
    const classId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const teacherId = String(formData.get("teacherId") ?? "") || undefined;
    const weekStart = String(formData.get("weekStart") ?? "");
    const entries = entriesFromForm(formData);
    if (!classId || !subjectId || !weekStart) return fail("بيانات ناقصة");
    await savePlan(asAdmin(actor), {
      teacherId, classId, subjectId, weekStart: new Date(weekStart), entries,
    });
    revalidatePath("/teacher/plan");
    revalidatePath("/admin/plans", "layout");
    return { ok: true, message: "حُفظت المسودة" };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "تعذر حفظ الخطة");
  }
}

/**
 * ينسخ خطة (صف، مادة، أسبوع) إلى شعب أخرى يدرّسها نفس المعلم لنفس المادة —
 * يتخطّى الخطط المسلّمة ويبدّل مسودات المستهدفة.
 */
export async function copyPlanToClassesAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("plans", "teacher");
    const sourceClassId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const weekStart = String(formData.get("weekStart") ?? "");
    const targets = formData.getAll("classIds").map(String).filter((c) => c && c !== sourceClassId);
    if (!sourceClassId || !subjectId || !weekStart || !targets.length)
      return fail("حدد شعبة واحدة على الأقل");

    const teacherId = actor.role !== "teacher" && formData.get("teacherId")
      ? String(formData.get("teacherId")) : actor.userId;
    const src = await prisma.weeklyPlan.findUnique({
      where: {
        teacherId_classId_subjectId_weekStart: {
          teacherId, classId: sourceClassId, subjectId, weekStart: new Date(weekStart),
        },
      },
      include: { entries: true },
    });
    if (!src?.entries.length) return fail("احفظ محتوى الخطة أولاً ثم طبّقها");

    const targetPlans = await prisma.weeklyPlan.findMany({
      where: { teacherId, subjectId, weekStart: new Date(weekStart), classId: { in: targets } },
    });
    const submitted = new Set(targetPlans.filter((p) => p.status === "submitted").map((p) => p.classId));

    const entries: PlanEntryInput[] = src.entries.map((e) => ({
      weekday: e.weekday,
      lessonTitle: e.lessonTitle ?? undefined,
      textbook: e.textbook ?? undefined,
      platforms: e.platforms ?? undefined,
      tests: e.tests ?? undefined,
      notes: e.notes ?? undefined,
    }));
    let done = 0, skipped = 0;
    for (const classId of targets) {
      if (submitted.has(classId)) { skipped++; continue; }
      await savePlan(asAdmin(actor), {
        teacherId: actor.role !== "teacher" ? teacherId : undefined,
        classId, subjectId, weekStart: new Date(weekStart), entries,
      });
      done++;
    }
    revalidatePath("/teacher/plan");
    revalidatePath("/admin/plans", "layout");
    return {
      ok: true,
      message: `طُبّقت الخطة على ${done} شعبة${skipped ? ` — تخطّى ${skipped} مسلّمة` : ""}`,
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "تعذر التطبيق");
  }
}

export async function submitPlanAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("plans", "teacher");
    const planId = String(formData.get("planId") ?? "");
    if (!planId) return fail("معرّف مفقود");
    await submitPlan(asAdmin(actor), planId);
    revalidatePath("/teacher/plan");
    revalidatePath("/admin/plans", "layout");
    return { ok: true, message: "سُلّمت الخطة للتجميع" };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "تعذر التسليم");
  }
}

/** تسليم كل مسودات المعلم لمادة ما في أسبوع — بعد «تطبيق على شعب أخرى» */
export async function submitAllSubjectPlansAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("plans", "teacher");
    const subjectId = String(formData.get("subjectId") ?? "");
    const weekStart = String(formData.get("weekStart") ?? "");
    if (!subjectId || !weekStart) return fail("بيانات ناقصة");
    const drafts = await prisma.weeklyPlan.findMany({
      where: { teacherId: actor.userId, subjectId, weekStart: new Date(weekStart), status: "draft" },
      select: { id: true },
    });
    if (!drafts.length) return fail("لا مسودات بانتظار التسليم");
    for (const p of drafts) await submitPlan(asAdmin(actor), p.id);
    revalidatePath("/teacher/plan");
    revalidatePath("/admin/plans", "layout");
    return { ok: true, message: `سُلّمت ${drafts.length} خطة` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "تعذر التسليم");
  }
}

export async function unsubmitPlanAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("plans", "teacher");
    const planId = String(formData.get("planId") ?? "");
    if (!planId) return fail("معرّف مفقود");
    await unsubmitPlan(asAdmin(actor), planId);
    revalidatePath("/teacher/plan");
    revalidatePath("/admin/plans", "layout");
    return { ok: true, message: "أعيدت للمسودة — عدّلها ثم سلّمها مجدداً" };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "تعذر الإرجاع");
  }
}

/** تجميع خطط الصف المسلّمة ونشر لقطة موحّدة — إدارة فقط */
export async function publishClassPlanAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("plans");
    const classId = String(formData.get("classId") ?? "");
    const weekStart = String(formData.get("weekStart") ?? "");
    if (!classId || !weekStart) return fail("بيانات ناقصة");
    const res = await publishClassPlan(asAdmin(actor), {
      classId, weekStart: new Date(weekStart),
    });
    // إشعار داخلي لأولياء طلاب الصف
    const cls = await prisma.classGroup.findUnique({ where: { id: classId }, select: { displayName: true, name: true } });
    const links = await prisma.guardianStudent.findMany({
      where: { verified: true, student: { enrollments: { some: { classId } } } },
      select: { guardian: { select: { userId: true } } },
    });
    await notifyUsers(
      links.map((l) => l.guardian.userId),
      {
        type: "plan_published",
        title: `الخطة الأسبوعية — ${cls?.displayName ?? cls?.name ?? "الصف"}`,
        body: `نُشرت الخطة الموحّدة (${res.subjects} مواد) — متاحة للاطلاع`,
        href: "/parent/plans",
      },
    );
    revalidatePath("/admin/plans", "layout");
    after(() => drainOutbox());
    return {
      ok: true,
      message: `نُشرت الخطة الموحّدة (${res.subjects} مواد) — جارٍ إشعار ${res.guardians} ولي أمر`,
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "تعذر النشر");
  }
}

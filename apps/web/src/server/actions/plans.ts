"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
import { requireRole } from "../session";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

/** حفظ مسودة الخطة — المعلم لإسناده أو الإدارة لأي إسناد */
export async function savePlanAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const classId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const teacherId = String(formData.get("teacherId") ?? "") || undefined;
    const weekStart = String(formData.get("weekStart") ?? "");
    const entries = entriesFromForm(formData);
    if (!classId || !subjectId || !weekStart) return fail("بيانات ناقصة");
    await savePlan(actor, {
      teacherId, classId, subjectId, weekStart: new Date(weekStart), entries,
    });
    revalidatePath("/teacher/plan");
    revalidatePath("/admin/plans", "layout");
    return { ok: true, message: "حُفظت المسودة" };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "تعذر حفظ الخطة");
  }
}

export async function submitPlanAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const planId = String(formData.get("planId") ?? "");
    if (!planId) return fail("معرّف مفقود");
    await submitPlan(actor, planId);
    revalidatePath("/teacher/plan");
    revalidatePath("/admin/plans", "layout");
    return { ok: true, message: "سُلّمت الخطة للتجميع" };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "تعذر التسليم");
  }
}

export async function unsubmitPlanAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const planId = String(formData.get("planId") ?? "");
    if (!planId) return fail("معرّف مفقود");
    await unsubmitPlan(actor, planId);
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
    const actor = await requireRole("admin");
    const classId = String(formData.get("classId") ?? "");
    const weekStart = String(formData.get("weekStart") ?? "");
    if (!classId || !weekStart) return fail("بيانات ناقصة");
    const res = await publishClassPlan(actor, {
      classId, weekStart: new Date(weekStart),
    });
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

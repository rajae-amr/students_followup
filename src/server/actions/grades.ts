"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@app/db";
import {
  createAssessment, setGrade, setEvaluation, weekStartOf,
  recordBehavior, addNote,
} from "@app/core";
import { requireRole } from "../session";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const wrap = (e: unknown, fb: string): Result =>
  fail(e instanceof Error && e.message ? e.message : fb);

export async function createAssessmentAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    await createAssessment(actor, {
      classId: String(formData.get("classId") ?? ""),
      subjectId: String(formData.get("subjectId") ?? ""),
      termId: String(formData.get("termId") ?? "") || undefined,
      title: String(formData.get("title") ?? ""),
      kind: (String(formData.get("kind") ?? "quiz")) as "quiz",
      date: new Date(`${String(formData.get("date"))}T00:00:00.000Z`),
      maxScore: Number(formData.get("maxScore")),
    });
    revalidatePath("/teacher/grades");
    return { ok: true };
  } catch (e) {
    return wrap(e, "تعذر إنشاء التقييم");
  }
}

export async function setGradeAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const raw = String(formData.get("score") ?? "").trim();
    await setGrade(actor, {
      assessmentId: String(formData.get("assessmentId") ?? ""),
      studentId: String(formData.get("studentId") ?? ""),
      score: raw === "" ? null : Number(raw),
      note: String(formData.get("note") ?? "") || undefined,
    });
    revalidatePath("/teacher/grades");
    return { ok: true };
  } catch (e) {
    return wrap(e, "تعذر حفظ الدرجة");
  }
}

/** حفظ كل بنود تقييم طالب دفعة واحدة للأسبوع المحدد — حقول eval_<category> */
export async function setEvaluationRowAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const studentId = String(formData.get("studentId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const weekRaw = String(formData.get("weekStart") ?? "").trim();
    const weekStart = weekRaw ? new Date(`${weekRaw}T00:00:00.000Z`) : weekStartOf(new Date());
    let saved = 0, cleared = 0;
    for (const [key, val] of formData.entries()) {
      if (!key.startsWith("eval_")) continue;
      const value = String(val ?? "").trim();
      const category = key.slice(5);
      if (!value) {
        // «—» اختيار صريح — يمسح قيمة محفوظة لهذا الأسبوع إن وُجدت
        const res = await prisma.evaluation.deleteMany({
          where: {
            teacherId: actor.userId, subjectId, studentId, weekStart, category,
          },
        });
        cleared += res.count;
        continue;
      }
      await setEvaluation(actor, { studentId, subjectId, weekStart, category, value });
      saved++;
    }
    if (!saved && !cleared) return fail("لا بنود معبّأة");
    revalidatePath("/teacher/evaluation");
    return {
      ok: true,
      message: `حُفظ ${saved} بنداً` + (cleared ? ` — مُسح ${cleared}` : ""),
    };
  } catch (e) {
    return wrap(e, "تعذر حفظ التقييم");
  }
}

export async function setEvaluationAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    await setEvaluation(actor, {
      studentId: String(formData.get("studentId") ?? ""),
      subjectId: String(formData.get("subjectId") ?? ""),
      termId: String(formData.get("termId") ?? "") || undefined,
      category: String(formData.get("category") ?? ""),
      value: String(formData.get("value") ?? ""),
    });
    revalidatePath("/teacher/evaluation");
    return { ok: true };
  } catch (e) {
    return wrap(e, "تعذر حفظ التقييم");
  }
}

export async function recordBehaviorAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    await recordBehavior(actor, {
      studentId: String(formData.get("studentId") ?? ""),
      date: new Date(`${String(formData.get("date"))}T00:00:00.000Z`),
      category: (String(formData.get("category") ?? "") || undefined) as
        | "excellent" | "committed" | "needs_followup" | undefined,
      text: String(formData.get("text") ?? ""),
      lessonSessionId: String(formData.get("lessonSessionId") ?? "") || undefined,
      audience: formData.get("audience") === "internal" ? "internal" : "family",
    });
    return { ok: true, message: "سُجّل السلوك" };
  } catch (e) {
    return wrap(e, "تعذر تسجيل السلوك");
  }
}

/** ملاحظة سريعة على طالب من كشف الحصة — مقابل /today/note القديم */
export async function addNoteAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    await addNote(actor, {
      studentId: String(formData.get("studentId") ?? ""),
      text: String(formData.get("text") ?? ""),
      category: String(formData.get("category") ?? "free"),
      audience: formData.get("audience") === "internal" ? "internal" : "family",
    });
    return { ok: true, message: "حُفظت الملاحظة" };
  } catch (e) {
    return wrap(e, "تعذر حفظ الملاحظة");
  }
}

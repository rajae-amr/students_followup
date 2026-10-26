"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@app/db";
import {
  createAssessment, setGrade, bulkSetGrades, setEvaluation, weekStartOf,
  recordBehavior, addNote,
  updateAssessment, deleteAssessment, publishAssessment,
  GRADE_STATUSES, type GradeStatus,
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
      publish: formData.get("publish") === "on" || formData.get("publish") === "true",
    });
    revalidatePath("/teacher/grades");
    return { ok: true };
  } catch (e) {
    return wrap(e, "تعذر إنشاء التقييم");
  }
}

export async function updateAssessmentAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    await updateAssessment(actor, {
      id: String(formData.get("id") ?? ""),
      title: String(formData.get("title") ?? "") || undefined,
      kind: (String(formData.get("kind") ?? "") || undefined) as "quiz" | undefined,
      date: formData.get("date") ? new Date(`${String(formData.get("date"))}T00:00:00.000Z`) : undefined,
      maxScore: formData.get("maxScore") ? Number(formData.get("maxScore")) : undefined,
      termId: formData.has("termId") ? (String(formData.get("termId") ?? "") || null) : undefined,
    });
    revalidatePath("/teacher/grades");
    return { ok: true, message: "حُدّث التقييم" };
  } catch (e) {
    return wrap(e, "تعذر تحديث التقييم");
  }
}

export async function deleteAssessmentAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    await deleteAssessment(actor, { id: String(formData.get("id") ?? "") });
    revalidatePath("/teacher/grades");
    return { ok: true, message: "حُذف التقييم ودرجاته" };
  } catch (e) {
    return wrap(e, "تعذر حذف التقييم");
  }
}

/** نشر التقييم (يدخل التقارير وبوابة الأهل) أو إعادته مسودة */
export async function publishAssessmentAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const publish = formData.get("publish") === "true";
    await publishAssessment(actor, { id: String(formData.get("id") ?? ""), publish });
    revalidatePath("/teacher/grades");
    return { ok: true, message: publish ? "نُشر — سيظهر في التقارير" : "أُعيد مسودة" };
  } catch (e) {
    return wrap(e, "تعذر تغيير حالة النشر");
  }
}

export async function setGradeAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const raw = String(formData.get("score") ?? "").trim();
    const statusRaw = String(formData.get("status") ?? "normal").trim();
    const status = (GRADE_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as GradeStatus)
      : "normal";
    await setGrade(actor, {
      assessmentId: String(formData.get("assessmentId") ?? ""),
      studentId: String(formData.get("studentId") ?? ""),
      score: raw === "" ? null : Number(raw),
      status,
      note: String(formData.get("note") ?? "") || undefined,
    });
    revalidatePath("/teacher/grades");
    return { ok: true };
  } catch (e) {
    return wrap(e, "تعذر حفظ الدرجة");
  }
}

/** تعبئة عمود تقييم بالكامل — mode: fill (بالعظمى) | clear (مسح) | absent (الكل غائب) */
export async function fillColumnAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const assessmentId = String(formData.get("assessmentId") ?? "");
    const mode = String(formData.get("mode") ?? "");
    if (!["fill", "clear", "absent"].includes(mode)) return fail("وضع غير معروف");

    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return fail("التقييم غير موجود");
    const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
    const roster = await prisma.enrollment.findMany({
      where: { classId: assessment.classId, academicYearId: year?.id, student: { isActive: true } },
      select: { studentId: true },
    });
    const rows = roster.map((e) => ({
      studentId: e.studentId,
      ...(mode === "fill"
        ? { score: assessment.maxScore, status: "normal" as GradeStatus }
        : mode === "absent"
          ? { score: null, status: "absent" as GradeStatus }
          : { score: null, status: "normal" as GradeStatus }),
    }));
    const saved = await bulkSetGrades(actor, { assessmentId, rows });
    revalidatePath("/teacher/grades");
    const msg = mode === "fill" ? `مُلئت ${saved} خلية بالعظمى` : mode === "absent" ? `عُلّم ${saved} طالباً غائباً` : `مُسحت ${saved} خلية`;
    return { ok: true, message: msg };
  } catch (e) {
    return wrap(e, "تعذر تنفيذ العملية");
  }
}

/** لصق عمود درجات — rows JSON: [{studentId, score}] أو نص أسطر مرتب بترتيب الكشف */
export async function setGradeColumnAction(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("teacher", "admin");
    const assessmentId = String(formData.get("assessmentId") ?? "");
    const rowsRaw = String(formData.get("rows") ?? "");
    let rows: { studentId: string; score: number | null; status?: GradeStatus }[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      return fail("تنسيق البيانات غير صالح");
    }
    if (!Array.isArray(rows)) return fail("تنسيق البيانات غير صالح");
    const saved = await bulkSetGrades(actor, { assessmentId, rows });
    revalidatePath("/teacher/grades");
    return { ok: true, message: `حُفظت ${saved} درجة` };
  } catch (e) {
    return wrap(e, "تعذر لصق الدرجات");
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

/**
 * خدمة السلوك والملاحظات — مستقلة عن الحضور تماماً.
 * تسجيل سلوك لا ينشئ أي سجل حضور.
 */

import { prisma } from "@app/db";
import {
  ForbiddenError,
  NotFoundError,
  requireActive,
  requireTeacher,
} from "../permissions";
import type { Actor } from "../permissions";
import { StateError } from "../attendance/service";

export type BehaviorCategory = "excellent" | "committed" | "needs_followup";

const CATEGORIES: BehaviorCategory[] = [
  "excellent",
  "committed",
  "needs_followup",
];

export const BEHAVIOR_AR: Record<BehaviorCategory, string> = {
  excellent: "ممتاز",
  committed: "ملتزم",
  needs_followup: "يحتاج متابعة",
};

/** تسجيل ملاحظة سلوك لطالب — في حصة (اختياري) أو بتاريخ فقط */
export async function recordBehavior(
  actor: Actor,
  input: {
    studentId: string;
    date: Date;
    category?: BehaviorCategory;
    text?: string;
    audience?: "internal" | "family";
    lessonSessionId?: string;
  },
) {
  requireTeacher(actor);
  if (!input.category && !input.text?.trim())
    throw new StateError("أدخل تصنيفاً أو نصاً");
  if (input.category && !CATEGORIES.includes(input.category))
    throw new StateError("تصنيف غير صالح");

  if (input.lessonSessionId) {
    const session = await prisma.lessonSession.findUnique({
      where: { id: input.lessonSessionId },
    });
    if (!session) throw new NotFoundError("الحصة غير موجودة");
    if (actor.role === "teacher" && session.teacherId !== actor.userId)
      throw new ForbiddenError();
  } else if (actor.role === "teacher") {
    // بدون حصة: يجب أن يكون الطالب ضمن صف يدرّسه المعلم هذا العام
    const year = await prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    const allowed = year
      ? await prisma.enrollment.findFirst({
          where: {
            studentId: input.studentId,
            academicYearId: year.id,
            class: {
              assignments: {
                some: { teacherId: actor.userId, isActive: true },
              },
            },
          },
        })
      : null;
    if (!allowed) throw new ForbiddenError("الطالب خارج نطاق تدريسك");
  }

  const entry = await prisma.behaviorEntry.create({
    data: {
      studentId: input.studentId,
      date: input.date,
      lessonSessionId: input.lessonSessionId ?? null,
      period: null,
      teacherId: actor.userId,
      category: input.category ?? null,
      text: input.text?.trim() || null,
      audience: input.audience ?? "internal",
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorId: actor.userId,
      action: "behavior.record",
      entityType: "BehaviorEntry",
      entityId: entry.id,
      after: { category: entry.category, audience: entry.audience },
    },
  });
  return entry;
}

/** ملاحظة حرة (غير مرتبطة بحصة) — نفس نطاق recordBehavior */
export async function addNote(
  actor: Actor,
  input: {
    studentId: string;
    text: string;
    category?: string;
    audience?: "internal" | "family";
  },
) {
  requireTeacher(actor);
  if (!input.text.trim()) throw new StateError("النص مطلوب");

  const note = await prisma.note.create({
    data: {
      studentId: input.studentId,
      authorId: actor.userId,
      date: new Date(),
      category: input.category ?? "free",
      text: input.text.trim(),
      audience: input.audience ?? "internal",
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: actor.userId,
      action: "note.add",
      entityType: "Note",
      entityId: note.id,
    },
  });
  return note;
}

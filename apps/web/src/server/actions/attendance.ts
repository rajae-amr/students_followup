"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import {
  clearAttendance,
  ensureSession,
  markAllPresent,
  recordAttendance,
  submitSession,
  ConflictError,
  ForbiddenError,
  StateError,
  type LessonAttendance,
} from "@app/core";
import { drainOutbox } from "@/lib/jobs/drain";
import { requireActor } from "../session";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

function toResult(e: unknown): ActionResult {
  if (e instanceof ConflictError)
    return { ok: false, error: "تغيّر السجل من جهة أخرى — حدّث الصفحة" };
  if (e instanceof ForbiddenError)
    return { ok: false, error: "غير مصرح بهذا الإجراء" };
  if (e instanceof StateError) return { ok: false, error: e.message };
  return { ok: false, error: "حدث خطأ غير متوقع" };
}

export async function markStudent(input: {
  sessionId: string;
  studentId: string;
  status: LessonAttendance;
  expectedRevision?: number;
}): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await recordAttendance(actor, input);
    // تنبيهات الغياب الآلية قد تُدرج داخل recomputeDaily — أرسلها فوراً
    after(() => drainOutbox(10));
    revalidatePath(`/teacher/session/${input.sessionId}`);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function unmarkStudent(input: {
  sessionId: string;
  studentId: string;
  expectedRevision?: number;
}): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await clearAttendance(actor, input);
    revalidatePath(`/teacher/session/${input.sessionId}`);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function markAllPresentAction(
  sessionId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await markAllPresent(actor, sessionId);
    revalidatePath(`/teacher/session/${sessionId}`);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function submitSessionAction(
  sessionId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await submitSession(actor, sessionId);
    after(() => drainOutbox(10));
    revalidatePath(`/teacher/session/${sessionId}`);
    revalidatePath("/teacher");
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

/** يفتح جلسة الحصة (ينشئها عند الحاجة) ثم يحوّل لصفحتها */
export async function openSession(
  slotId: string,
  dateISO: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const session = await ensureSession(actor, slotId, new Date(dateISO));
    redirect(`/teacher/session/${session.id}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return toResult(e);
  }
}

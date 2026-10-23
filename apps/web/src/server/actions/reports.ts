"use server";

import { revalidatePath } from "next/cache";
import {
  buildStudentReport,
  createReportSnapshot,
  queueReportDelivery,
  ForbiddenError,
  StateError,
  type StudentReportContent,
} from "@app/core";
import { prisma } from "@app/db";
import { requireRole } from "../session";

export type ReportResult =
  | { ok: true; report: StudentReportContent }
  | { ok: false; error: string };

/** معاينة تقرير طالب — الإدارة والمعلم (ضمن نطاقه) */
export async function previewReport(input: {
  studentId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<ReportResult> {
  try {
    const actor = await requireRole("admin", "teacher");
    const report = await buildStudentReport(actor, {
      studentId: input.studentId,
      rangeStart: new Date(input.rangeStart),
      rangeEnd: new Date(input.rangeEnd),
    });
    return { ok: true, report };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "غير مصرح" };
    return { ok: false, error: "تعذر توليد التقرير" };
  }
}

/** اعتماد التقرير كلقطة ثابتة — الإدارة فقط */
export async function approveReport(input: {
  studentId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("admin");
    await createReportSnapshot(actor, {
      studentId: input.studentId,
      rangeStart: new Date(input.rangeStart),
      rangeEnd: new Date(input.rangeEnd),
    });
    revalidatePath("/admin/reports");
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذر اعتماد التقرير" };
  }
}

/** إرسال تقرير معتمد عبر الطابور — الإدارة فقط */
export async function sendReport(
  reportSnapshotId: string,
): Promise<{ ok: boolean; error?: string; queued?: number }> {
  try {
    const actor = await requireRole("admin");
    const res = await queueReportDelivery(actor, { reportSnapshotId });
    revalidatePath("/admin/reports");
    return { ok: true, queued: res.queued };
  } catch (e) {
    if (e instanceof StateError) return { ok: false, error: e.message };
    return { ok: false, error: "تعذر جدولة الإرسال" };
  }
}

export async function listSnapshots() {
  await requireRole("admin");
  return prisma.reportSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { student: { select: { fullName: true } } },
  });
}

/** إعادة جدولة حدث إرسال فاشل — الإدارة فقط */
export async function retryOutboxEvent(
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    await requireRole("admin");
    const id = String(formData.get("eventId") ?? "");
    const ev = await prisma.outboxEvent.findUnique({ where: { id } });
    if (!ev) return { ok: false, error: "الحدث غير موجود" };
    if (ev.status !== "failed" && ev.status !== "pending")
      return { ok: false, error: `لا يمكن إعادة حدث بحالة «${ev.status}»` };
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: "pending", nextAttemptAt: new Date(), lastError: null },
    });
    revalidatePath("/admin/reports");
    return { ok: true, message: "أُعيدت الجدولة — سيحاول العامل الإرسال قريباً" };
  } catch {
    return { ok: false, error: "تعذرت إعادة الجدولة" };
  }
}

/** إلغاء حدث إرسال معلّق — الإدارة فقط */
export async function cancelOutboxEvent(
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    await requireRole("admin");
    const id = String(formData.get("eventId") ?? "");
    const ev = await prisma.outboxEvent.findUnique({ where: { id } });
    if (!ev) return { ok: false, error: "الحدث غير موجود" };
    if (ev.status !== "pending" && ev.status !== "failed")
      return { ok: false, error: `لا يمكن إلغاء حدث بحالة «${ev.status}»` };
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: "cancelled" },
    });
    revalidatePath("/admin/reports");
    return { ok: true, message: "أُلغي الحدث" };
  } catch {
    return { ok: false, error: "تعذر الإلغاء" };
  }
}

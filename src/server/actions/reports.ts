"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  buildStudentReport,
  createReportSnapshot,
  queueReportDelivery,
  ForbiddenError,
  StateError,
  type StudentReportContent,
} from "@app/core";
import { prisma } from "@app/db";
import { drainOutbox } from "@/lib/jobs/drain";
import { requirePerm, asAdmin } from "../session";

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
    const actor = await requirePerm("reports", "teacher");
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
    const actor = await requirePerm("reports");
    await createReportSnapshot(asAdmin(actor), {
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
    const actor = await requirePerm("reports");
    const res = await queueReportDelivery(asAdmin(actor), { reportSnapshotId });
    // إرسال فوري في الخلفية — الفاشل يُعاد عبر /api/cron/sweep
    after(() => drainOutbox(30));
    revalidatePath("/admin/reports");
    return { ok: true, queued: res.queued };
  } catch (e) {
    if (e instanceof StateError) return { ok: false, error: e.message };
    return { ok: false, error: "تعذر جدولة الإرسال" };
  }
}

export async function listSnapshots() {
  await requirePerm("reports");
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
    await requirePerm("reports");
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
    after(() => drainOutbox(10));
    return { ok: true, message: "أُعيدت الجدولة — سيُحاول الإرسال فوراً" };
  } catch {
    return { ok: false, error: "تعذرت إعادة الجدولة" };
  }
}

/** إلغاء حدث إرسال معلّق — الإدارة فقط */
export async function cancelOutboxEvent(
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    await requirePerm("reports");
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

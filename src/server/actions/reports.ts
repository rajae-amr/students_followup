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

/** تحديث صفحات قسم التقارير الثلاث — التوليد واللقطات وسجل الإرسال */
const refresh = () => {
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/snapshots");
  revalidatePath("/admin/reports/outbox");
};

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
    refresh();
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
    refresh();
    return { ok: true, queued: res.queued };
  } catch (e) {
    if (e instanceof StateError) return { ok: false, error: e.message };
    return { ok: false, error: "تعذر جدولة الإرسال" };
  }
}

/** إلغاء لقطة معتمدة قبل إرسالها — يمنع إرسالها لاحقاً ويحفظ سجلها */
export async function cancelSnapshotAction(
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    await requirePerm("reports");
    const id = String(formData.get("snapshotId") ?? "");
    const snap = await prisma.reportSnapshot.findUnique({ where: { id } });
    if (!snap) return { ok: false, error: "اللقطة غير موجودة" };
    if (snap.status !== "approved")
      return { ok: false, error: `لا يمكن إلغاء لقطة بحالة «${snap.status}»` };
    await prisma.reportSnapshot.update({
      where: { id },
      data: { status: "cancelled" },
    });
    refresh();
    return { ok: true, message: "أُلغيت اللقطة — لن تُرسل" };
  } catch {
    return { ok: false, error: "تعذر الإلغاء" };
  }
}

/** حذف لقطة نهائياً — المسودة والملغاة فقط (المعتمدة/المرسلة سجل تدقيقي محميّ) */
export async function deleteSnapshotAction(
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    await requirePerm("reports");
    const id = String(formData.get("snapshotId") ?? "");
    const snap = await prisma.reportSnapshot.findUnique({ where: { id } });
    if (!snap) return { ok: false, error: "اللقطة غير موجودة" };
    if (snap.status === "approved" || snap.status === "sent")
      return { ok: false, error: "اللقطات المعتمدة والمرسلة سجل محميّ — ألغِها بدل الحذف" };
    await prisma.reportSnapshot.delete({ where: { id } });
    refresh();
    return { ok: true, message: "حُذفت اللقطة" };
  } catch {
    return { ok: false, error: "تعذر الحذف" };
  }
}

/** إعادة جدولة كل أحداث الإرسال الفاشلة دفعة واحدة */
export async function retryAllFailedAction(): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    await requirePerm("reports");
    const { count } = await prisma.outboxEvent.updateMany({
      where: { status: "failed" },
      data: { status: "pending", nextAttemptAt: new Date(), lastError: null },
    });
    if (!count) return { ok: false, error: "لا أحداث فاشلة" };
    refresh();
    after(() => drainOutbox(50));
    return { ok: true, message: `أُعيدت جدولة ${count} حدثاً — الإرسال جارٍ` };
  } catch {
    return { ok: false, error: "تعذرت الإعادة" };
  }
}

/**
 * توليد جماعي للقطات معتمدة — صف/مستوى/كل المدرسة لمدى محدد أو فصل كامل،
 * مع خيار إرسالها فوراً لأولياء الأمور المخوَّلين.
 */
export async function bulkGenerateReportsAction(
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const actor = await requirePerm("reports");
    const scope = String(formData.get("scope") ?? "");
    const termId = String(formData.get("termId") ?? "");
    const send = formData.get("send") === "1";

    let rangeStart: Date, rangeEnd: Date, termRef: string | null = null;
    if (termId) {
      const term = await prisma.term.findUnique({ where: { id: termId } });
      if (!term) return { ok: false, error: "الفصل غير موجود" };
      rangeStart = term.startDate;
      rangeEnd = term.endDate;
      termRef = term.id;
    } else {
      rangeStart = new Date(String(formData.get("rangeStart") ?? ""));
      rangeEnd = new Date(String(formData.get("rangeEnd") ?? ""));
    }
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime()) || rangeEnd < rangeStart)
      return { ok: false, error: "مدى التقرير غير صالح" };

    // نطاق الطلاب: قيد نشط في العام الحالي ضمن الاختيار
    const year = await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
    if (!year) return { ok: false, error: "لا يوجد عام دراسي حالي" };
    const enrollWhere =
      scope === "class"
        ? { classId: String(formData.get("classId") ?? ""), academicYearId: year.id }
        : scope === "grade"
          ? { class: { gradeId: String(formData.get("gradeId") ?? "") }, academicYearId: year.id }
          : scope === "all"
            ? { academicYearId: year.id }
            : null;
    if (!enrollWhere) return { ok: false, error: "اختر نطاقاً صحيحاً" };

    const enrollments = await prisma.enrollment.findMany({
      where: { ...enrollWhere, student: { isActive: true } },
      select: { studentId: true },
    });
    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    if (!studentIds.length) return { ok: false, error: "لا طلاب نشطين في هذا النطاق" };

    const admin = asAdmin(actor);
    let created = 0, reused = 0, sent = 0;
    for (const studentId of studentIds) {
      const existing = await prisma.reportSnapshot.findFirst({
        where: { studentId, rangeStart, rangeEnd, status: { in: ["approved", "sent"] } },
        select: { id: true, status: true },
      });
      let snapId = existing?.id ?? "";
      if (existing) reused++;
      else {
        const snap = await createReportSnapshot(admin, { studentId, rangeStart, rangeEnd, termId: termRef ?? undefined });
        snapId = snap.id;
        created++;
      }
      if (send && snapId) {
        const r = await queueReportDelivery(admin, { reportSnapshotId: snapId }).catch(() => null);
        if (r) sent += r.queued;
      }
    }
    refresh();
    after(() => drainOutbox(50));
    const range = `${rangeStart.toISOString().slice(0, 10)} → ${rangeEnd.toISOString().slice(0, 10)}`;
    return {
      ok: true,
      message: `${range}: ${created} تقريراً جديداً${reused ? ` · ${reused} موجوداً` : ""}${send ? ` · ${sent} رسالة مدرجة` : ""}`,
    };
  } catch {
    return { ok: false, error: "تعذر التوليد الجماعي" };
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
    refresh();
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
    refresh();
    return { ok: true, message: "أُلغي الحدث" };
  } catch {
    return { ok: false, error: "تعذر الإلغاء" };
  }
}

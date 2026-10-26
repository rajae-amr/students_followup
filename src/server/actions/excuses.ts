"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@app/db";
import { requireRole, requirePerm } from "../session";
import { notifyUsers } from "../notify";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

/** ولي الأمر يقدّم عذراً ليوم غياب — عذر واحد لكل طالب/يوم */
export async function submitExcuse(formData: FormData): Promise<Result> {
  try {
    const actor = await requireRole("guardian");
    const studentId = String(formData.get("studentId") ?? "");
    const dateStr = String(formData.get("date") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!studentId || !dateStr || !reason) return fail("بيانات ناقصة");
    if (reason.length > 500) return fail("السبب طويل جداً");

    const profile = await prisma.guardianProfile.findUnique({ where: { userId: actor.userId } });
    if (!profile) return fail("لا يوجد ملف ولي أمر");
    const link = await prisma.guardianStudent.findUnique({
      where: { guardianId_studentId: { guardianId: profile.id, studentId } },
    });
    if (!link?.verified) return fail("الطالب غير مرتبط بحسابك");

    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const existing = await prisma.excuse.findUnique({
      where: { studentId_date: { studentId, date } },
    });
    if (existing?.status === "approved") return fail("اعتُمد عذر لهذا اليوم مسبقاً");
    if (existing?.status === "pending") return fail("يوجد عذر قيد المراجعة لهذا اليوم");

    if (existing) {
      await prisma.excuse.update({
        where: { id: existing.id },
        data: { reason, status: "pending", note: null, decidedAt: null, decidedById: null },
      });
    } else {
      await prisma.excuse.create({
        data: { studentId, guardianId: profile.id, date, reason },
      });
    }
    revalidatePath(`/parent/student/${studentId}`);
    return { ok: true, message: "أُرسل العذر — بانتظار مراجعة الإدارة" };
  } catch {
    return fail("تعذر إرسال العذر");
  }
}

/** الإدارة تعتمد أو ترفض عذراً — الاعتماد يحوّل ملخص اليوم إلى «بعذر» */
export async function decideExcuse(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("attendance");
    const id = String(formData.get("id") ?? "");
    const decision = String(formData.get("decision") ?? "");
    const note = String(formData.get("note") ?? "").trim() || null;
    if (!id || !["approved", "rejected"].includes(decision)) return fail("بيانات غير صحيحة");

    const excuse = await prisma.excuse.findUnique({
      where: { id },
      include: { student: { select: { fullName: true } }, guardian: { select: { userId: true } } },
    });
    if (!excuse) return fail("العذر غير موجود");
    if (excuse.status !== "pending") return fail("بُتّ في هذا العذر مسبقاً");

    await prisma.excuse.update({
      where: { id },
      data: { status: decision, note, decidedById: actor.userId, decidedAt: new Date() },
    });

    if (decision === "approved") {
      await prisma.dailySummary.updateMany({
        where: { studentId: excuse.studentId, date: excuse.date },
        data: { status: "excused" },
      });
    }

    await notifyUsers([excuse.guardian.userId], {
      type: "excuse_decision",
      title: decision === "approved" ? `اعتُمد عذر ${excuse.student.fullName}` : `رُفض عذر ${excuse.student.fullName}`,
      body: `يوم ${excuse.date.toISOString().slice(0, 10)}${note ? ` — ${note}` : ""}`,
      href: `/parent/student/${excuse.studentId}`,
    });

    revalidatePath("/admin/excuses");
    return { ok: true, message: decision === "approved" ? "اعتُمد العذر وعُدّلت حالة اليوم" : "رُفض العذر" };
  } catch {
    return fail("تعذر حفظ القرار");
  }
}

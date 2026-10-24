/**
 * مهمة تنبيه غياب — تُستدعى من طابور pg-boss لأحداث type=absence_alert.
 * نفس ضمانات إرسال التقارير: محاولات مسجلة وتمييز الحالات الملتبسة.
 */
import { prisma } from "@app/db";
import { botApi, portalUrl } from "../telegram";

export async function sendAlertJob(outboxEventId: string): Promise<void> {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: outboxEventId },
  });
  if (!event || event.status === "done" || event.status === "cancelled") return;

  const payload = event.payload as {
    studentId: string;
    guardianId: string;
    studentName: string;
    date: string;
    status: string;
    telegramChatId?: string | null;
  };

  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  try {
    let providerMsgId: string | null = null;

    if (event.channel === "telegram") {
      if (!payload.telegramChatId)
        throw new Error("ولي الأمر غير مرتبط بتيليجرام");
      const settings = await prisma.schoolSettings.findUnique({
        where: { id: "school" },
      });
      const statusText = payload.status === "excused" ? "غياباً بعذر" : "غياباً";
      const text =
        `${settings?.schoolName ?? "المدرسة"} — تنبيه غياب\n` +
        `نود إعلامكم بتسجيل الطالب/ة «${payload.studentName}» ${statusText} ` +
        `يوم ${payload.date}.\n` +
        `للاستفسار أو تقديم عذر يرجى التواصل مع إدارة المدرسة.` +
        (portalUrl() ? `\n\nبوابة أولياء الأمور:\n${portalUrl()}` : "");
      const msg = await botApi().sendMessage(payload.telegramChatId, text);
      providerMsgId = String(msg.message_id);
    } else {
      providerMsgId = "portal"; // يظهر في بوابة ولي الأمر
    }

    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: "success",
          providerMsgId,
        },
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "done", lastError: null },
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const ambiguous = /timeout|ETIMEDOUT|ECONNRESET/i.test(message);
    const maxed = event.attempts + 1 >= 8;
    await prisma.$transaction([
      prisma.deliveryAttempt.create({
        data: {
          outboxEventId: event.id,
          channel: event.channel,
          result: ambiguous ? "ambiguous" : "failed",
          error: message.slice(0, 500),
        },
      }),
      prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: ambiguous || maxed ? "failed" : "pending",
          lastError: message.slice(0, 500),
          nextAttemptAt: ambiguous
            ? new Date()
            : new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** event.attempts)),
        },
      }),
    ]);
    throw err;
  }
}

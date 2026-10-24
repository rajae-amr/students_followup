/**
 * مهمة إرسال تقرير — تُستدعى من طابور pg-boss.
 * تسجّل كل محاولة في DeliveryAttempt وتحدّث OutboxEvent.
 */

import { prisma } from "@app/db";
import { botApi, renderReportText, splitMessage } from "../telegram";
import type { StudentReportContent } from "@app/core";

export async function sendReportJob(outboxEventId: string): Promise<void> {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: outboxEventId },
  });
  if (!event || event.status === "done" || event.status === "cancelled") return;

  const payload = event.payload as {
    reportSnapshotId: string;
    studentId: string;
    guardianId: string;
    telegramChatId?: string | null;
  };

  const report = await prisma.reportSnapshot.findUnique({
    where: { id: payload.reportSnapshotId },
  });
  if (!report) throw new Error("لقطة التقرير غير موجودة");

  const settings = await prisma.schoolSettings.findUnique({
    where: { id: "school" },
  });

  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  try {
    let providerMsgId: string | null = null;

    if (event.channel === "telegram") {
      if (!payload.telegramChatId)
        throw new Error("ولي الأمر غير مرتبط بتيليجرام");
      const api = botApi();
      const text = renderReportText(
        report.contentJson as unknown as StudentReportContent,
        settings?.schoolName ?? "المدرسة",
      );
      for (const part of splitMessage(text)) {
        const msg = await api.sendMessage(payload.telegramChatId, part);
        providerMsgId = String(msg.message_id);
      }
    } else {
      // قناة البوابة: التقرير معتمد ويظهر في حساب ولي الأمر — لا إرسال خارجي
      providerMsgId = "portal";
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
      prisma.reportSnapshot.update({
        where: { id: report.id },
        data: { status: "sent" },
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // timeout بعد إرسال محتمل = حالة ملتبسة تُسجّل للمراجعة بدل إعادة عمياء
    const ambiguous = /timeout|ETIMEDOUT|ECONNRESET/i.test(message);
    // سقف المحاولات: بعد 8 محاولات يُعلَّم فاشلاً بدل إعادة أبدية (ولي حظر البوت)
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
    throw err; // يعيد المحاولة عبر pg-boss وفق سياسته
  }
}

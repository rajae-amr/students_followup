/**
 * مهمة التلخيص الأسبوعي — رسالة واحدة لكل ولي أمر تشمل كل أبنائه.
 * تقرأ لقطات التقارير المعتمدة وتدمج نصوصها في رسالة موحدة.
 */
import { prisma } from "@app/db";
import { botApi, renderReportText, splitMessage } from "../telegram";
import type { StudentReportContent } from "@app/core";

export async function sendDigestJob(outboxEventId: string): Promise<void> {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: outboxEventId },
  });
  if (!event || event.status === "done" || event.status === "cancelled") return;

  const payload = event.payload as {
    guardianId: string;
    telegramChatId?: string | null;
    reportSnapshotIds: string[];
    rangeStart: string;
    rangeEnd: string;
  };

  const reports = await prisma.reportSnapshot.findMany({
    where: { id: { in: payload.reportSnapshotIds } },
  });
  if (!reports.length) throw new Error("لا لقطات لهذا التلخيص");

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

      // رسالة واحدة تدمج تقارير الأبناء — كالنظام القديم
      const parts = reports.map((r) =>
        renderReportText(
          r.contentJson as unknown as StudentReportContent,
          settings?.schoolName ?? "المدرسة",
        ),
      );
      const text = parts.join("\n\n———————————————\n\n");

      const api = botApi();
      for (const part of splitMessage(text)) {
        const msg = await api.sendMessage(payload.telegramChatId, part);
        providerMsgId = String(msg.message_id);
      }
    } else {
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
      prisma.reportSnapshot.updateMany({
        where: { id: { in: reports.map((r) => r.id) } },
        data: { status: "sent" },
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

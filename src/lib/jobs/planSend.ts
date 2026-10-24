/**
 * مهمة إشعار الخطة الأسبوعية — رسالة + PDF موحّد واحد لكل ولي أمر.
 * يقرأ اللقطة المنشورة ويولّد المستند لكل حدث (رسالة واحدة لكل دردشة).
 */
import { InputFile } from "grammy";
import { prisma } from "@app/db";
import { schoolWeekDays } from "@app/core";
import type { PublishedPlanSubject } from "@app/core";
import { botApi, portalUrl, splitMessage } from "../telegram";
import { renderPlanPdf } from "../planPdf";

export async function sendPlanJob(outboxEventId: string): Promise<void> {
  const event = await prisma.outboxEvent.findUnique({ where: { id: outboxEventId } });
  if (!event || event.status === "done" || event.status === "cancelled") return;

  const payload = event.payload as {
    guardianId: string;
    telegramChatId?: string | null;
    publicationId: string;
  };

  const pub = await prisma.classWeeklyPlanPublication.findUnique({
    where: { id: payload.publicationId },
    include: {
      class: { select: { displayName: true, name: true, academicYear: { select: { name: true } } } },
    },
  });
  if (!pub) throw new Error("لقطة الخطة غير موجودة");

  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  try {
    let providerMsgId: string | null = null;

    if (event.channel === "telegram") {
      if (!payload.telegramChatId) throw new Error("ولي الأمر غير مرتبط بتيليجرام");

      const [settings, weekDays] = await Promise.all([
        prisma.schoolSettings.findUnique({ where: { id: "school" } }),
        schoolWeekDays(),
      ]);
      const className = pub.class.displayName ?? pub.class.name;
      const fmt = (d: Date) =>
        d.toLocaleDateString("ar", { day: "numeric", month: "long", timeZone: "UTC" });
      const end = new Date(pub.weekStart);
      end.setUTCDate(end.getUTCDate() + 6);
      const weekRange = `${fmt(pub.weekStart)} – ${fmt(end)}`;
      const subjects = pub.contentJson as unknown as PublishedPlanSubject[];
      const done = subjects.filter((x) => !x.missing).length;

      const text = [
        `📚 الخطة الأسبوعية — ${className}`,
        `الأسبوع: ${weekRange}`,
        `المواد المشمولة: ${done}${subjects.length > done ? ` من ${subjects.length}` : ""}`,
        "",
        "المستند الموحّد مرفق أدناه.",
        ...(portalUrl() ? ["", `بوابة أولياء الأمور:\n${portalUrl()}/plans`] : []),
      ].join("\n");

      const api = botApi();
      for (const part of splitMessage(text)) {
        const msg = await api.sendMessage(payload.telegramChatId, part);
        providerMsgId = String(msg.message_id);
      }

      const pdf = await renderPlanPdf({
        schoolName: settings?.schoolName ?? "المدرسة",
        className,
        schoolYear: pub.class.academicYear?.name,
        weekRange,
        weekDays,
        subjects,
      });
      const doc = await api.sendDocument(
        payload.telegramChatId,
        new InputFile(pdf, `خطة-أسبوعية-${pub.class.name}.pdf`),
        { caption: `الخطة الأسبوعية الموحّدة — ${className}` },
      );
      providerMsgId = String(doc.message_id);
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

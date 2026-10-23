/**
 * مسح الطوابير بديل pg-boss — يعالج أحداث Outbox المستحقة وصندوق تيليجرام.
 * يُستدعى مباشرة بعد الإجراءات المولّدة للأحداث، ودورياً عبر /api/cron/sweep.
 * كل مهمة تسجّل محاولاتها في DeliveryAttempt وتطبّق السقوط الأسي بنفسها.
 */

import { prisma } from "@app/db";
import { sendReportJob } from "./reportSend";
import { sendAlertJob } from "./alertSend";
import { sendDigestJob } from "./digestSend";
import { sendPlanJob } from "./planSend";
import { processTelegramUpdate } from "./telegramInbox";

/** إرسال أحداث Outbox المستحقة — يعيد عدد ما نجح معالجته */
export async function drainOutbox(limit = 25): Promise<number> {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    select: { id: true, type: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let done = 0;
  for (const e of pending) {
    try {
      if (e.type === "report_send") await sendReportJob(e.id);
      else if (e.type === "absence_alert") await sendAlertJob(e.id);
      else if (e.type === "weekly_digest") await sendDigestJob(e.id);
      else if (e.type === "plan_notify") await sendPlanJob(e.id);
      else continue;
      done++;
    } catch (err) {
      // المحاولة مسجلة داخل المهمة — تُعاد وفق nextAttemptAt
      console.error(`[drain] فشل حدث ${e.id} (${e.type}):`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}

/**
 * معالجة تحديثات تيليجرام العالقة — شبكة أمان لأي فشل في المعالجة الفورية
 * داخل webhook (مقتطع «processing» العتيق يُسترد بعد 10 دقائق).
 */
export async function drainTelegramInbox(limit = 25): Promise<number> {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const pending = await prisma.telegramUpdateInbox.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "processing", createdAt: { lt: staleBefore } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  // تحرير العالق في processing ليستطيع processTelegramUpdate المطالبة به
  await prisma.telegramUpdateInbox.updateMany({
    where: { status: "processing", createdAt: { lt: staleBefore } },
    data: { status: "pending" },
  });
  let done = 0;
  for (const u of pending) {
    try {
      await processTelegramUpdate(u.id);
      done++;
    } catch (err) {
      console.error(`[drain] فشل تحديث ${u.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}

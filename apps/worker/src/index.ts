/**
 * العامل الخلفي — خدمة Node.js مستقلة:
 * - pg-boss على PostgreSQL: إرسال التقارير، معالجة inbox تيليجرام
 * - مُزامِن دوري يدفع أحداث Outbox المعلّقة للطابور
 * - الجدولة الآلية معطلة حتى ضبط التقويم (REPORTS_CRON_ENABLED)
 */

// تحميل apps/worker/.env دائماً — لا يستبدل متغيرات موجودة.
// ملاحظة: @prisma/client يحمّل packages/db/.env عند الاستيراد،
// لذا لا يصح الاعتماد على غياب DATABASE_URL كمؤشر.
import { join } from "node:path";

try {
  process.loadEnvFile(join(__dirname, "../.env"));
} catch { /* لا ملف — تعتمد على بيئة النظام */ }

import PgBoss from "pg-boss";
import { prisma } from "@app/db";
import { sendReportJob } from "./jobs/reportSend";
import { sendAlertJob } from "./jobs/alertSend";
import { sendDigestJob } from "./jobs/digestSend";
import { weeklyRunJob } from "./jobs/weeklyRun";
import { processTelegramUpdate } from "./jobs/telegramInbox";

const DATABASE_URL = process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL;
const SWEEP_MS = 15_000;

const QUEUES = {
  reportSend: "report-send",
  alertSend: "alert-send",
  digestSend: "digest-send",
  weeklyRun: "weekly-run",
  telegramInbox: "telegram-inbox",
} as const;

async function sweepOutbox(boss: PgBoss) {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    select: { id: true, type: true },
    take: 50,
  });
  for (const e of pending) {
    const queue = e.type === "report_send" ? QUEUES.reportSend
      : e.type === "absence_alert" ? QUEUES.alertSend
      : e.type === "weekly_digest" ? QUEUES.digestSend
      : null;
    if (queue) {
      await boss.send(
        queue,
        { outboxEventId: e.id },
        {
          singletonKey: e.id,
          retryLimit: 3,
          retryBackoff: true,
          retryDelay: 60,
        },
      );
    }
  }
}

/**
 * وضع polling للتطوير — بديل webhook حين لا يوجد عنوان عام.
 * يجلب getUpdates ويخزّنها في TelegramUpdateInbox (update_id فريد).
 * لا يعمل بالتوازي مع webhook على نفس الرمز.
 */
function startTelegramPolling() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  let offset = 0;
  const poll = async () => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}`,
      );
      const data = (await res.json()) as {
        ok: boolean;
        result?: { update_id: number }[];
      };
      for (const u of data.result ?? []) {
        offset = u.update_id + 1;
        await prisma.telegramUpdateInbox.upsert({
          where: { updateId: u.update_id },
          create: { updateId: u.update_id, payload: u },
          update: {},
        });
      }
    } catch (e) {
      console.error("[poll] خطأ:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  };
  // حلقة مستمرة — long polling بمهلة 25 ثانية
  const loop = async () => {
    for (;;) await poll();
  };
  void loop();
  console.log("[poll] جلب تحديثات تيليجرام مفعّل (getUpdates)");
}

async function sweepTelegramInbox(boss: PgBoss) {
  const pending = await prisma.telegramUpdateInbox.findMany({
    where: { status: "pending" },
    select: { id: true },
    take: 50,
  });
  for (const u of pending) {
    await boss.send(
      QUEUES.telegramInbox,
      { inboxId: u.id },
      { singletonKey: u.id, retryLimit: 5, retryBackoff: true, retryDelay: 30 },
    );
  }
}

async function main() {
  if (!DATABASE_URL) {
    console.error("[worker] DATABASE_URL غير مضبوط — خروج");
    process.exit(1);
  }

  const cronEnabled = process.env.REPORTS_CRON_ENABLED === "true";
  console.log("[worker] بدء العامل الخلفي");
  console.log(`[worker] الجدولة الآلية: ${cronEnabled ? "مفعّلة" : "معطّلة (بانتظار ضبط التقويم)"}`);

  const boss = new PgBoss(DATABASE_URL);
  boss.on("error", (e) => console.error("[worker] pg-boss:", e));
  await boss.start();

  await boss.createQueue(QUEUES.reportSend);
  await boss.createQueue(QUEUES.alertSend);
  await boss.createQueue(QUEUES.digestSend);
  await boss.createQueue(QUEUES.telegramInbox);

  await boss.work(QUEUES.reportSend, async ([job]) => {
    await sendReportJob((job!.data as { outboxEventId: string }).outboxEventId);
  });

  await boss.work(QUEUES.alertSend, async ([job]) => {
    await sendAlertJob((job!.data as { outboxEventId: string }).outboxEventId);
  });

  await boss.work(QUEUES.digestSend, async ([job]) => {
    await sendDigestJob((job!.data as { outboxEventId: string }).outboxEventId);
  });

  // التقرير الأسبوعي الآلي — يتطلب REPORTS_CRON_ENABLED=true وتقويماً مهيأً
  // cron افتراضي: الجمعة 15:00 (نهاية الأسبوع الدراسي إثنين–جمعة)
  if (cronEnabled) {
    const cron = process.env.REPORTS_CRON ?? "0 15 * * 5";
    await boss.createQueue(QUEUES.weeklyRun);
    await boss.schedule(QUEUES.weeklyRun, cron);
    await boss.work(QUEUES.weeklyRun, async () => {
      await weeklyRunJob();
    });
    console.log(`[worker] جدولة التقارير الأسبوعية: ${cron}`);
  }

  await boss.work(QUEUES.telegramInbox, async ([job]) => {
    await processTelegramUpdate((job!.data as { inboxId: string }).inboxId);
  });

  const sweep = async () => {
    try {
      await sweepOutbox(boss);
      await sweepTelegramInbox(boss);
    } catch (e) {
      console.error("[worker] خطأ في المزامنة:", e);
    }
  };
  const timer = setInterval(sweep, SWEEP_MS);
  await sweep();

  if (process.env.TELEGRAM_POLL === "true") startTelegramPolling();

  const shutdown = async () => {
    console.log("[worker] إيقاف...");
    clearInterval(timer);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("[worker] خطأ فادح:", err);
  process.exit(1);
});

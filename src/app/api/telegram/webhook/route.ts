/**
 * استقبال تحديثات تيليجرام من webhook:
 * 1. يتحقق من الترويسة السرية (TELEGRAM_WEBHOOK_SECRET)
 * 2. يخزّن التحديث خاماً في TelegramUpdateInbox (update_id فريد — لا معالجة مكررة)
 * 3. يرد 200 فوراً ثم يعالج التحديث ويمسح Outbox عبر after()
 */

import { NextResponse, after } from "next/server";
import { prisma } from "@app/db";
import { processTelegramUpdate } from "@/lib/jobs/telegramInbox";
import { drainOutbox } from "@/lib/jobs/drain";

export const maxDuration = 60;

const MAX_BODY = 100_000; // 100KB — حمولة رسالة تيليجرام كافية

export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const text = await request.text();
  if (text.length > MAX_BODY) {
    return new NextResponse("payload too large", { status: 413 });
  }

  let update: { update_id?: number };
  try {
    update = JSON.parse(text);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
  if (typeof update.update_id !== "number") {
    return new NextResponse("bad request", { status: 400 });
  }

  const inbox = await prisma.telegramUpdateInbox.upsert({
    where: { updateId: update.update_id },
    create: { updateId: update.update_id, payload: JSON.parse(text) },
    update: {},
  });

  // معالجة فورية بعد الرد — أوامر البوت قد تولّد أحداث إرسال (تقرير عند الطلب،
  // تنبيه غياب آلي داخل recomputeDaily) فنمسحها في نفس المهمة.
  after(async () => {
    try {
      await processTelegramUpdate(inbox.id);
    } catch (err) {
      console.error("[webhook] فشل معالجة التحديث:", err);
    }
    try {
      await drainOutbox(10);
    } catch (err) {
      console.error("[webhook] فشل مسح Outbox:", err);
    }
  });

  return new NextResponse("ok");
}

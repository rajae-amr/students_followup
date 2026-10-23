/**
 * استقبال تحديثات تيليجرام من webhook:
 * 1. يتحقق من الترويسة السرية (TELEGRAM_WEBHOOK_SECRET)
 * 2. يخزّن التحديث خاماً في TelegramUpdateInbox (update_id فريد — لا معالجة مكررة)
 * 3. يرد 200 فوراً — المعالجة الفعلية في العامل الخلفي
 */

import { NextResponse } from "next/server";
import { prisma } from "@app/db";

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

  await prisma.telegramUpdateInbox.upsert({
    where: { updateId: update.update_id },
    create: { updateId: update.update_id, payload: JSON.parse(text) },
    update: {},
  });

  return new NextResponse("ok");
}

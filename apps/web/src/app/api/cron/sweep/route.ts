/**
 * مسح دوري للطوابير — إعادة محاولة الأحداث المتعثرة وتحديثات تيليجرام العالقة.
 * يُجدول يومياً عبر Vercel Cron، ويمكن نداؤه كل دقيقة من خدمة خارجية مجانية
 * (cron-job.org) لإعادة محاولة أسرع: GET /api/cron/sweep?secret=<CRON_SECRET>
 */

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { drainOutbox, drainTelegramInbox } from "@/lib/jobs/drain";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new NextResponse("unauthorized", { status: 401 });

  let sent = 0;
  // حتى 3 دفعات — الباقي يُعاد في النداء التالي
  for (let i = 0; i < 3; i++) {
    const n = await drainOutbox(25);
    sent += n;
    if (n < 25) break;
  }
  const inbox = await drainTelegramInbox(25);

  return NextResponse.json({ ok: true, sent, inbox });
}

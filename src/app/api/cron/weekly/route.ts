/**
 * التلخيص الأسبوعي الآلي — يولّد اللقطات ويدرج ويرسل رسالة موحدة لكل ولي أمر.
 * مجدول الجمعة 15:00 مسقط (11:00 UTC) عبر vercel.json.
 */

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { weeklyRunJob } from "@/lib/jobs/weeklyRun";
import { drainOutbox } from "@/lib/jobs/drain";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new NextResponse("unauthorized", { status: 401 });

  await weeklyRunJob();

  let sent = 0;
  for (let i = 0; i < 3; i++) {
    const n = await drainOutbox(25);
    sent += n;
    if (n < 25) break;
  }
  // المتبقي (إن وُجد) يلتقطه /api/cron/sweep
  return NextResponse.json({ ok: true, sent });
}

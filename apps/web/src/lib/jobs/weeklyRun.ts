/**
 * تشغيل التلخيص الأسبوعي — يولّد اللقطات ويدرج أحداث الإرسال.
 * يتخطى بأمان إن لم يُهيأ التقويم بعد.
 */
import { generateWeeklyDigests } from "@app/core";

export async function weeklyRunJob(): Promise<void> {
  const res = await generateWeeklyDigests({ requireCalendar: true });
  if (res.skippedNoCalendar) {
    console.log("[weekly] التقويم غير مهيأ — تخطّي الإرسال الأسبوعي");
    return;
  }
  console.log(
    `[weekly] ${res.rangeStart} → ${res.rangeEnd}: ` +
    `${res.students} طالباً، ${res.guardians} ولياً، ${res.queued} حدثاً مدرجاً`,
  );
}

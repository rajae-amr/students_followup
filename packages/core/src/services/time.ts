/**
 * توقيت المدرسة — المدرسة تعمل بمنطقة زمنية ثابتة (افتراضياً Asia/Muscat)
 * بينما خوادم الويب والعامل تعمل UTC. كل استعلام عن «اليوم» أو «الأسبوع
 * الحالي» يجب أن يمر من هنا وإلا انزاح التاريخ في ساعات المساء المحلية.
 */

import { prisma } from "@app/db";

const DEFAULT_TZ = "Asia/Muscat";

/** المنطقة الزمنية المهيأة في إعدادات المدرسة */
export async function schoolTimezone(): Promise<string> {
  const s = await prisma.schoolSettings.findUnique({
    where: { id: "school" },
    select: { timezone: true },
  });
  return s?.timezone || DEFAULT_TZ;
}

/** تاريخ اليوم بتوقيت المدرسة بصيغة ISO (YYYY-MM-DD) */
export function schoolTodayStr(timezone = DEFAULT_TZ): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

/** تاريخ اليوم بتوقيت المدرسة كـDate على منتصف الليل UTC — يطابق أعمدة @db.Date */
export function schoolToday(timezone = DEFAULT_TZ): Date {
  return new Date(`${schoolTodayStr(timezone)}T00:00:00.000Z`);
}

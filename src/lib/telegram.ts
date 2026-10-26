/**
 * عميل تيليجرام للإرسال — Api فقط، بلا polling.
 * يراعي حدّ الرسالة 4096 حرفاً بتقسيم آمن على الأسطر.
 */

import { Bot } from "grammy";
import type { StudentReportContent } from "@app/core";

const TELEGRAM_LIMIT = 4096;

export function botApi() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN غير مضبوط");
  return new Bot(token).api;
}

/** يقسم نصاً طويلاً على حدود الأسطر ضمن حد تيليجرام */
export function splitMessage(text: string, limit = TELEGRAM_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit; // لا سطر مناسب قريب — قصّ مباشر
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) parts.push(rest);
  return parts;
}

/** رابط بوابة أولياء الأمور — من رابط المنصة العام */
export function portalUrl(): string {
  const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/parent` : "";
}

/** تنسيق التقرير المدرسي الموحد كنص عربي */
export function renderReportText(c: StudentReportContent, schoolName: string): string {
  const lines: string[] = [
    `📋 ${schoolName}`,
    `تقرير الطالب: ${c.student.name}${c.student.className ? ` — ${c.student.className}` : ""}`,
    `الفترة: ${c.range.start} → ${c.range.end}`,
    "",
    "— الحضور —",
    `أيام مرصودة: ${c.attendance.daysRecorded} · حضور ${c.attendance.present} · غياب ${c.attendance.absent} · غياب جزئي ${c.attendance.partial} · استئذان ${c.attendance.excused} · تأخير ${c.attendance.late}`,
  ];

  if (c.attendance.lessonEntries.length) {
    lines.push("", "تفاصيل الحصص:");
    for (const e of c.attendance.lessonEntries)
      lines.push(`• ${e.date} حصة ${e.period} (${e.subject}): ${e.statusAr}`);
  }

  if (c.grades.length) {
    lines.push("", "— الدرجات —");
    for (const g of c.grades) {
      lines.push(`${g.subject} (${g.teacher}):`);
      for (const a of g.assessments) {
        const mark = a.status !== "normal"
          ? { absent: "غائب", excused: "غائب بعذر", exempt: "معفى" }[a.status] ?? "—"
          : `${a.score ?? "—"}/${a.max}`;
        lines.push(`  • ${a.title} ${a.date}: ${mark}`);
      }
    }
  }

  if (c.evaluations.length) {
    lines.push("", "— التقييمات —");
    for (const e of c.evaluations)
      lines.push(`• ${e.subject} (${e.teacher}) ${e.category}: ${e.value}`);
  }

  const famBehavior = c.behavior.filter((b) => b.category || b.text);
  if (famBehavior.length) {
    lines.push("", "— السلوك —");
    for (const b of famBehavior)
      lines.push(`• ${b.date}: ${b.category ?? ""} ${b.text ?? ""}`.trim());
  }

  const portal = portalUrl();
  lines.push("", portal ? `للتفاصيل الكاملة — بوابة أولياء الأمور:\n${portal}` : "للتفاصيل الكاملة: بوابة أولياء الأمور.");
  return lines.join("\n");
}

/**
 * polling للتطوير المحلي فقط — يحاكي webhook تيليجرام:
 * يجلب getUpdates ويعيد نشرها إلى /api/telegram/webhook المحلي
 * بنفس ترويسة السر — أي يمر بالمسار الإنتاجي حرفياً.
 *
 * التشغيل: npm run poll:telegram   (خادم dev يجب أن يعمل)
 */

import { join } from "node:path";

try {
  process.loadEnvFile(join(import.meta.dirname, "../apps/web/.env"));
} catch { /* بيئة النظام */ }

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const target = process.env.POLL_TARGET ?? "http://localhost:3000";

if (!token || !secret) {
  console.error("يلزم TELEGRAM_BOT_TOKEN و TELEGRAM_WEBHOOK_SECRET في apps/web/.env");
  process.exit(1);
}

let offset = 0;
console.log(`[poll] نشر تحديثات البوت إلى ${target}/api/telegram/webhook`);

for (;;) {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}`,
    );
    const data = (await res.json()) as { ok: boolean; result?: { update_id: number }[] };
    for (const u of data.result ?? []) {
      offset = u.update_id + 1;
      const r = await fetch(`${target}/api/telegram/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": secret!,
        },
        body: JSON.stringify(u),
      });
      console.log(`[poll] update ${u.update_id} → webhook ${r.status}`);
    }
  } catch (e) {
    console.error("[poll] خطأ:", e instanceof Error ? e.message : e);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

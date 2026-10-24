# نظام المتابعة — Next.js

تطبيق ويب متكامل لمتابعة الطلاب: حضور، سلوك، درجات، تقييمات أسبوعية، تقارير أولياء الأمور، وبوت تيليجرام — **كل شيء يعمل داخل تطبيق Next.js واحد على Vercel**.

## البنية

```
src/            تطبيق Next.js — الواجهات + API + بوت تيليجرام + الإرسال + cron
  lib/jobs      منطق المهام: إرسال التقارير/التنبيهات، معالجة البوت، التلخيص
packages/db     Prisma + PostgreSQL (المخطط والترحيلات)
packages/core   منطق العمل المشترك (الحضور، التقارير، التلخيص، التقييمات)
packages/auth   Better Auth + إنشاء الحسابات (معلم/ولي)
packages/ui     مكوّنات واجهة مشتركة
scripts/        telegram-poll.ts (محلي) + seed/bootstrap
tools/          backup.ps1 — نسخ احتياطي PostgreSQL
```

## تدفق الرسائل (بدون عامل منفصل)

- **webhook تيليجرام** يخزّن التحديث ثم يعالجه فوراً عبر `after()` — أوامر المعلم والولي
- **إرسال مباشر**: اعتماد تقرير / تنبيه غياب / تلخيص يدوي → `after(() => drainOutbox())`
- **`/api/cron/sweep`** (يومي + يمكن نداؤه خارجياً كل دقيقة): إعادة محاولة المتعثر
- **`/api/cron/weekly`** (الجمعة 15:00 مسقط): التقارير الأسبوعية المجمعة

## التشغيل المحلي

```bash
npm install
cp .env.example .env        # املأ القيم
npm run db:generate && npm run db:migrate

npm run dev              # http://localhost:3000
npm run poll:telegram    # طرفية ثانية — اختبار البوت محلياً
```

## متغيرات البيئة (`.env`)

| المتغير | الملاحظة |
|---|---|
| `DATABASE_URL` | PostgreSQL — رابط pooling في الإنتاج |
| `DIRECT_URL` | اتصال مباشر لـPrisma (migrations) — يُقرأ أيضاً من `packages/db/.env` |
| `BETTER_AUTH_SECRET` | 32+ حرفاً |
| `BETTER_AUTH_URL` | عنوان الموقع العام (`https://...` في الإنتاج) |
| `SCHOOL_NAME` / `SCHOOL_TIMEZONE` | Asia/Muscat |
| `TELEGRAM_BOT_TOKEN` | من BotFather |
| `TELEGRAM_BOT_USERNAME` | يظهر في قسائم الحسابات المطبوعة |
| `TELEGRAM_WEBHOOK_SECRET` | **إلزامي للإنتاج** — بدونه الـwebhook يرفض كل شيء 403 |
| `CRON_SECRET` | يحمي `/api/cron/*` — Vercel Cron يرسله تلقائياً |

## النشر — Vercel فقط

1. Root Directory: **جذر المشروع** — يتعرف على workspaces تلقائياً
2. عيّن متغيرات الجدول أعلاه في Environment Variables
3. الترحيلات على قاعدة الإنتاج: `npm run db:migrate` (بـ`DATABASE_URL`/`DIRECT_URL` للإنتاج)
4. **Cron**: `vercel.json` في الجذر مجدول تلقائياً:
   - `/api/cron/weekly` — الجمعة 11:00 UTC (15:00 مسقط)
   - `/api/cron/sweep` — يومياً 05:00 UTC (إعادة محاولات)
   - لإعادة محاولة أسرع: خدمة مجانية (cron-job.org) تنادي `/api/cron/sweep?secret=<CRON_SECRET>` كل دقيقة
5. **webhook تيليجرام**:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<DOMAIN>/api/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

### الشعار
ضع `public/logo.png` — يظهر تلقائياً في الترويسة والقسائم.

## أوامر مفيدة

```bash
npm run typecheck    # فحص الأنواع للتطبيق
npm run test         # اختبارات vitest (الحزم)
npm run db:studio    # Prisma Studio
```

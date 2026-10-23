# نظام المتابعة — Next.js

تطبيق ويب متكامل لمتابعة الطلاب: حضور، سلوك، درجات، تقييمات أسبوعية، تقارير أولياء الأمور، وتكامل تيليجرام.

## البنية

```
apps/web        تطبيق Next.js (App Router) — الواجهات + API + webhook تيليجرام
apps/worker     عامل منفصل — pg-boss: إرسال التقارير، صندوق تيليجرام، التقارير الأسبوعية
packages/db     Prisma + PostgreSQL (المخطط والترحيلات والبذور)
packages/core   منطق العمل المشترك (الحضور، التقارير، التلخيص، التقييمات)
packages/auth   Better Auth + إنشاء الحسابات (معلم/ولي)
packages/ui     مكوّنات واجهة مشتركة
tools/          أدوات ترحيل البيانات القديمة (SQLite → PostgreSQL)
tests/          اختبارات الوحدة (vitest)
```

## التشغيل المحلي

```bash
npm install
cp .env.example apps/web/.env        # املأ القيم
cp apps/worker/.env.example apps/worker/.env
npm run db:generate && npm run db:migrate

npm run dev          # الويب على http://localhost:3000
npm run dev:worker   # العامل (طرفية ثانية)
```

## متغيرات البيئة

| المتغير | web | worker | الملاحظة |
|---|---|---|---|
| `DATABASE_URL` | ✅ | ✅ | PostgreSQL — رابط مُدار pooling في الإنتاج |
| `DIRECT_URL` | ✅ | — | اتصال مباشر لـPrisma (migrations) |
| `WORKER_DATABASE_URL` | — | ⬜ | اختياري — يتجاوز `DATABASE_URL` للعامل |
| `BETTER_AUTH_SECRET` | ✅ | ✅ | 32+ حرفاً — **نفس القيمة في الخدمتين** |
| `BETTER_AUTH_URL` | ✅ | ✅ | عنوان الموقع العام |
| `SCHOOL_NAME` / `SCHOOL_TIMEZONE` | ✅ | — | Asia/Muscat |
| `TELEGRAM_BOT_TOKEN` | — | ✅ | من BotFather |
| `TELEGRAM_BOT_USERNAME` | ✅ | ⬜ | يظهر في قسائم الحسابات المطبوعة |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | — | **إلزامي للإنتاج** — بدونه كل تحديثات الـwebhook تُرفض 403 |
| `TELEGRAM_POLL` | — | ⬜ | `true` للتطوير المحلي فقط |
| `REPORTS_CRON_ENABLED` / `REPORTS_CRON` | — | ✅ | الافتراضي `0 15 * * 5` (الجمعة 15:00) |

## النشر

### الويب → Vercel
- Root Directory: `next-app/apps/web` — يتعرف Vercel على workspaces تلقائياً عبر `package-lock.json`
- عيّن متغيرات عمود `web` أعلاه في Project Settings → Environment Variables
- شغّل الترحيلات على قاعدة الإنتاج مرة واحدة: `npm run db:migrate` (مع `DATABASE_URL`/`DIRECT_URL` للإنتاج)

### العامل → خدمة منفصلة (Railway/Fly/VPS…)
- **لا يُنشر على Vercel** — عملية طويلة الأمد
- `npm install && npm run build -w @app/worker && node apps/worker/dist/index.cjs`
- عيّن متغيرات عمود `worker`

### تيليجرام — الإنتاج
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<DOMAIN>/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### الشعار
ضع `apps/web/public/logo.png` — يظهر تلقائياً في الترويسة والقسائم (بديل: شارة الأحرف الأولى).

## أوامر مفيدة

```bash
npm run typecheck    # فحص الأنواع لكل الحزم
npm run test         # اختبارات vitest
npm run db:studio    # Prisma Studio
```

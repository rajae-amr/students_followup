/**
 * حارس مسارات cron — يقبل Authorization: Bearer <CRON_SECRET> (Vercel Cron)
 * أو ?secret=<CRON_SECRET> لأدوات النداء الخارجية (cron-job.org مثلاً).
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

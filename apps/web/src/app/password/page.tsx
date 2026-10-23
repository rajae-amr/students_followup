import { requireActor } from "@/server/session";
import { prisma } from "@app/db";
import { changeOwnPassword } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { AppShell } from "@/components/app-shell";
import { linksFor } from "@/components/nav-links";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const actor = await requireActor();
  const { first } = await searchParams;
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  });
  const input =
    "mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <AppShell userName={user?.name ?? ""} role={actor.role} links={linksFor(actor.role)}>
      <div className="mx-auto max-w-md">
        <PageHeader title="تغيير كلمة المرور" subtitle="حماية حسابك بكلمة مرور جديدة" />
        {first === "1" && (
          <Card className="mb-4 border-accent-200 bg-accent-50 p-4">
            <p className="text-sm font-medium text-accent-800">
              أول دخول لحسابك — يجب تعيين كلمة مرور خاصة بك للمتابعة.
            </p>
          </Card>
        )}
        <Card>
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon.key className="h-5 w-5" />
            </span>
            <p className="text-sm text-slate-500">
              اختر كلمة مرور قوية من 8 أحرف على الأقل
            </p>
          </div>
          <FormWithResult action={changeOwnPassword} submitLabel="تغيير كلمة المرور">
            <div className="grid w-full gap-3">
              <label className="block text-sm font-medium text-slate-600">كلمة المرور الحالية
                <input name="currentPassword" type="password" required className={input} dir="ltr" />
              </label>
              <label className="block text-sm font-medium text-slate-600">كلمة المرور الجديدة
                <input name="newPassword" type="password" required minLength={8} className={input} dir="ltr" />
              </label>
            </div>
          </FormWithResult>
          <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
            <Icon.lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            التغيير يلغي جلساتك الأخرى تلقائياً.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}

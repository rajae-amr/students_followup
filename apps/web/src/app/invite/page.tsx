import { Suspense } from "react";
import { InviteForm } from "./invite-form";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/ui/icons";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50/60 via-slate-50 to-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl bg-white p-8 shadow-lift ring-1 ring-slate-100">
          <div className="mb-6 flex justify-center">
            <Suspense fallback={<span className="h-14 w-40 rounded-xl bg-slate-100" />}>
              <Logo size="lg" />
            </Suspense>
          </div>
          <div className="mb-1 flex items-center justify-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-50 text-accent-600">
              <Icon.key className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">تفعيل دعوة المدرسة</h1>
          </div>
          <p className="mb-6 text-center text-sm text-slate-500">
            أدخل رمز الدعوة واختر اسم مستخدم وكلمة مرور
          </p>
          <InviteForm initialToken={token ?? ""} />
        </div>
      </div>
    </main>
  );
}

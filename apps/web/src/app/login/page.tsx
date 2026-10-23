import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getActor, homeFor } from "@/server/session";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export default async function LoginPage() {
  const actor = await getActor();
  if (actor) redirect(homeFor(actor.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50/60 via-slate-50 to-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl bg-white p-8 shadow-lift ring-1 ring-slate-100">
          <div className="mb-6 flex justify-center">
            <Suspense fallback={<span className="h-14 w-40 rounded-xl bg-slate-100" />}>
              <Logo size="lg" />
            </Suspense>
          </div>
          <h1 className="mb-1 text-center text-xl font-bold text-slate-900">
            تسجيل الدخول
          </h1>
          <p className="mb-6 text-center text-sm text-slate-500">
            أدخل اسم المستخدم وكلمة المرور
          </p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          نظام متابعة الطلاب — منصة آمنة للمدرسة وأولياء الأمور
        </p>
      </div>
    </main>
  );
}

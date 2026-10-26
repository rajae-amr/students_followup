"use client";

import { useState, useTransition } from "react";

type Result = { ok: boolean; message?: string; error?: string };

/** نموذج عام يعرض نتيجة Server Action — يستخدم لأي إجراء يعيد رسالة */
export function FormWithResult({
  action,
  submitLabel,
  children,
  className,
  bare,
  buttonClass,
  confirm,
}: {
  action: (fd: FormData) => Promise<Result>;
  /** عند غيابه لا يُعرض زر إرسال — تستخدم أزراراً مخصّصة داخل children */
  submitLabel?: string;
  children: React.ReactNode;
  className?: string;
  /** نمط مضغوط لصفوف الجداول — زر نصي بلا تخطيط بطاقة */
  bare?: boolean;
  /** تخصيص لون زر النمط المضغوط */
  buttonClass?: string;
  /** رسالة تأكيد قبل الإرسال (للإجراءات المدمّرة) */
  confirm?: string;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      action={(fd) =>
        startTransition(async () => setResult(await action(fd)))
      }
    >
      {!bare && <div className="flex flex-wrap items-end gap-2">{children}</div>}
      {bare && children}
      {submitLabel !== undefined && (
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={
            bare
              ? `${buttonClass ?? "text-xs font-semibold text-brand-600 hover:text-brand-700"} disabled:opacity-50`
              : "mt-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
          }
        >
          {pending ? "..." : submitLabel}
        </button>
      )}
      {result && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            result.ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
          dir="auto"
        >
          {result.ok ? (result.message ?? "تم") : result.error}
        </p>
      )}
    </form>
  );
}

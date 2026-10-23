"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-2xl">
        ⚠️
      </div>
      <h1 className="text-xl font-bold text-slate-900">حدث خطأ غير متوقع</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        تعذّر تحميل الصفحة. أعد المحاولة، وإن تكرر الخطأ راجع إدارة النظام.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-slate-300" dir="ltr">
          {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="mt-6 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

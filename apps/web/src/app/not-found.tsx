import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-2xl">
        🔍
      </div>
      <h1 className="text-xl font-bold text-slate-900">الصفحة غير موجودة</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        الرابط الذي طلبته غير متاح أو نُقل — تأكد من العنوان أو عد للوحة الرئيسية.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        العودة للرئيسية
      </Link>
    </div>
  );
}

import Link from "next/link";

/** ترقيم صفحات — روابط خادمية تحافظ على بقية المعاملات */
export function Pagination({
  page,
  pages,
  total,
  params,
  param = "page",
}: {
  page: number;
  pages: number;
  total: number;
  /** معاملات إضافية تُدمج في روابط الصفحات (q، sort، …) */
  params?: Record<string, string | undefined>;
  /** اسم معامل الصفحة — لجدولين مستقلين في الصفحة نفسها */
  param?: string;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
    sp.set(param, String(p));
    return `?${sp.toString()}`;
  };
  const btn = "min-w-9 rounded-lg px-2.5 py-1.5 text-center text-sm font-bold transition";
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="ترقيم الصفحات">
      <p className="text-xs text-slate-400">
        صفحة {page} من {pages} · {total} سجلاً
      </p>
      <div className="flex items-center gap-1.5" dir="ltr">
        {page > 1 && (
          <Link href={href(page - 1)} className={`${btn} bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand-300`} aria-label="السابق">
            ‹
          </Link>
        )}
        {Array.from({ length: Math.min(5, pages) }).map((_, i) => {
          // نافذة 5 صفحات حول الحالية
          let p = page - 2 + i;
          if (page <= 2) p = i + 1;
          if (page >= pages - 1) p = pages - 4 + i;
          if (p < 1 || p > pages) return null;
          return (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              className={`${btn} ${p === page ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand-300"}`}
            >
              {p}
            </Link>
          );
        })}
        {page < pages && (
          <Link href={href(page + 1)} className={`${btn} bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand-300`} aria-label="التالي">
            ›
          </Link>
        )}
      </div>
    </nav>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./icons";

export type Crumb = { label: string; href?: string };

/** ترويسة صفحة موحدة — مسار تنقّل أو رجوع + عنوان + وصف + إجراءات */
export function PageHeader({
  title,
  subtitle,
  crumbs,
  backHref,
  backLabel = "رجوع",
  actions,
}: {
  title: string;
  subtitle?: string;
  /** مسار هرمي: [{label, href?}] — آخر عنصر هو الصفحة الحالية */
  crumbs?: Crumb[];
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label="مسار التنقل" className="mb-2 flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <Icon.arrowBack className="h-3.5 w-3.5 rotate-180 text-slate-300" aria-hidden />}
                {c.href && !last ? (
                  <Link href={c.href} className="font-medium text-brand-700 transition hover:text-brand-800 hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className={last ? "font-semibold text-slate-700" : "text-slate-500"} aria-current={last ? "page" : undefined}>
                    {c.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      ) : backHref ? (
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <Icon.arrowBack className="h-4 w-4 rtl:rotate-180" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

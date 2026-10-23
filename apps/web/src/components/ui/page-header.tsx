import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./icons";

/** ترويسة صفحة موحدة — رجوع اختياري + عنوان + وصف + إجراءات */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "رجوع",
  actions,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {backHref && (
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <Icon.arrowBack className="h-4 w-4 rtl:rotate-180" />
          {backLabel}
        </Link>
      )}
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

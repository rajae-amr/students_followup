import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./icons";

/** بطاقة أساسية — سطح أبيض بظل ناعم وحواف مستديرة */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/80 ${className}`}>
      {children}
    </section>
  );
}

/** بطاقة تنقل بأيقونة — نمط شبكة لوحات التحكم */
export function NavCard({
  href,
  title,
  subtitle,
  icon,
  iconClass = "bg-brand-50 text-brand-700",
}: {
  href: string;
  title: string;
  subtitle?: string;
  icon: IconName;
  iconClass?: string;
}) {
  const I = Icon[icon];
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/80 transition hover:shadow-lift hover:ring-brand-300"
    >
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconClass}`}>
        <I className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-800">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-sm text-slate-500">{subtitle}</span>}
      </span>
      <Icon.arrowBack className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-brand-500 group-hover:-translate-x-0.5 rtl:rotate-180" />
    </Link>
  );
}

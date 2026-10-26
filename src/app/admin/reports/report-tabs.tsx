"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/reports", label: "التوليد", exact: true },
  { href: "/admin/reports/snapshots", label: "اللقطات" },
  { href: "/admin/reports/outbox", label: "سجل الإرسال" },
];

/** تبويبات قسم التقارير — تنقّل بين التوليد واللقطات وسجل الإرسال */
export function ReportTabs() {
  const path = usePathname();
  return (
    <nav className="mb-4 flex gap-1 rounded-2xl bg-slate-100 p-1" aria-label="أقسام التقارير">
      {TABS.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-bold transition ${
              active ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

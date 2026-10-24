"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** رابط تنقل مع تمييز النشط — للشريط العلوي (top) أو الجانبي الداكن (sidebar) */
export function NavLink({
  href,
  children,
  exact = false,
  variant = "top",
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  variant?: "top" | "sidebar";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={
        variant === "sidebar"
          ? `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-white/10 text-white before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-full before:bg-accent-400"
                : "text-brand-100/80 hover:bg-white/5 hover:text-white"
            }`
          : `rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-50 text-brand-800"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
      }
    >
      {children}
    </Link>
  );
}

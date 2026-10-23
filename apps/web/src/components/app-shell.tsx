import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "./logo";
import { NavLink } from "./ui/nav-link";
import { UserMenu } from "./user-menu";
import { Icon, type IconName } from "./ui/icons";

export interface ShellLink {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
}

/**
 * الهيكل الموحد — شريط علوي بشعار المدرسة وروابط الدور وقائمة المستخدم.
 * الروابط تظهر بأيقوناتها على الشاشات المتوسطة، ونصاً مضغوطاً على الجوال.
 */
export function AppShell({
  userName,
  role,
  links,
  children,
}: {
  userName: string;
  role: string;
  links: ShellLink[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 shadow-soft backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="min-w-0 shrink-0" aria-label="الرئيسية">
            <Suspense fallback={<span className="h-10 w-28 rounded-xl bg-slate-100" />}>
              <Logo />
            </Suspense>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="التنقل الرئيسي">
            {links.map((l) => (
              <NavLink key={l.href} href={l.href} exact={l.exact}>
                <span className="inline-flex items-center gap-1.5">
                  {(() => { const I = Icon[l.icon]; return <I className="h-4 w-4" />; })()}
                  {l.label}
                </span>
              </NavLink>
            ))}
          </nav>

          <UserMenu name={userName} role={role} />
        </div>

        {/* شريط تنقل الجوال — أيقونات قابلة للتمرير */}
        <nav
          className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-1.5 md:hidden"
          aria-label="التنقل الرئيسي"
        >
          {links.map((l) => (
            <NavLink key={l.href} href={l.href} exact={l.exact}>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {(() => { const I = Icon[l.icon]; return <I className="h-4 w-4" />; })()}
                {l.label}
              </span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

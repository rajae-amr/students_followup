import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "./logo";
import { NavDrawer, NavGroups } from "./side-nav";
import { UserMenu } from "./user-menu";
import { type IconName } from "./ui/icons";

export interface ShellLink {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  /** قسم إداري يتطلب تفويضه لدور "staff" — غيابه يعني للمدير فقط */
  perm?: string;
  /** عنوان قسم يجمع الروابط المتتابعة في الشريط الجانبي */
  group?: string;
}

/**
 * الهيكل الموحد — شريط جانبي تركوازي غامق على الشاشات الكبيرة،
 * وشريط علوي مع درج منزلق على الجوال. موحّد لكل الأدوار.
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
  const brand = (dark = false) => (
    <Link href="/" className="min-w-0" aria-label="الرئيسية">
      <Suspense fallback={<span className={`h-10 w-28 rounded-xl ${dark ? "bg-white/10" : "bg-slate-100"}`} />}>
        <Logo dark={dark} />
      </Suspense>
    </Link>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* شريط الجوال — هامبرغر + شعار + قائمة المستخدم */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-slate-100 bg-white/95 px-3 backdrop-blur lg:hidden print:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <NavDrawer
            links={links}
            brand={brand(true)}
            footer={<UserMenu name={userName} role={role} dark up />}
          />
          {brand(false)}
        </div>
        <UserMenu name={userName} role={role} />
      </header>

      {/* الشريط الجانبي — سطح المكتب */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col print:hidden">
        <div className="flex h-full flex-col bg-gradient-to-b from-brand-900 to-brand-950">
          <div className="border-b border-white/10 px-4 py-4 [&_a]:block">
            {brand(true)}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <NavGroups links={links} />
          </div>
          <div className="border-t border-white/10 p-3">
            <UserMenu name={userName} role={role} dark up />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 motion-safe:animate-[page-in_.3s_ease-out]">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

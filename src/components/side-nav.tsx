"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "./ui/nav-link";
import { Icon } from "./ui/icons";
import type { ShellLink } from "./app-shell";

/** روابط التنقل مجمّعة بعناوين أقسام — نمط الشريط الجانبي الداكن */
export function NavGroups({
  links,
  onNavigate,
}: {
  links: ShellLink[];
  onNavigate?: () => void;
}) {
  const sections: { name?: string; links: ShellLink[] }[] = [];
  for (const l of links) {
    const last = sections[sections.length - 1];
    if (last && last.name === l.group) last.links.push(l);
    else sections.push({ name: l.group, links: [l] });
  }
  return (
    <nav aria-label="التنقل الرئيسي">
      {sections.map((s, i) => (
        <div key={s.name ?? "_"} className={i > 0 ? "mt-5" : ""}>
          {s.name && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-brand-300">
              {s.name}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {s.links.map((l) => {
              const I = Icon[l.icon];
              return (
                <NavLink
                  key={l.href}
                  href={l.href}
                  exact={l.exact}
                  variant="sidebar"
                  onNavigate={onNavigate}
                >
                  <I className="h-5 w-5 shrink-0 opacity-80" />
                  <span className="truncate">{l.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** درج الجوال المنزلق — هامبرغر + خلفية مموّهة + إغلاق بالخارج/Escape/عند التنقل */
export function NavDrawer({
  links,
  brand,
  footer,
}: {
  links: ShellLink[];
  brand: ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="side-nav"
        aria-label="فتح القائمة"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100"
      >
        <Icon.menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm motion-safe:animate-[drawer-fade_.2s_ease-out]"
            onClick={() => setOpen(false)}
          />
          <aside
            id="side-nav"
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-gradient-to-b from-brand-900 to-brand-950 shadow-lift motion-safe:animate-[drawer-in_.25s_ease-out]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3.5">
              {brand}
              <button
                onClick={() => setOpen(false)}
                aria-label="إغلاق القائمة"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-brand-200 transition hover:bg-white/10 hover:text-white"
              >
                <Icon.close className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavGroups links={links} onNavigate={() => setOpen(false)} />
            </div>
            {footer && <div className="border-t border-white/10 p-3">{footer}</div>}
          </aside>
        </div>
      )}
    </>
  );
}

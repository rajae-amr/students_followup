"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./ui/icons";
import { markAllNotificationsRead } from "@/server/notify";

export type BellItem = {
  id: string;
  title: string;
  href: string | null;
  createdAt: string;
  read: boolean;
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-OM", { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString("ar-OM", { hour: "2-digit", minute: "2-digit" });
}

/** جرس الإشعارات — قائمة منسدلة بآخر الإشعارات وعدّاد غير المقروء */
export function NotificationBell({
  items,
  unread,
  dark = false,
  up = false,
}: {
  items: BellItem[];
  unread: number;
  /** نسخة داكنة لشريط سطح المكتب الجانبي */
  dark?: boolean;
  /** تفتح للأعلى (موضع أسفل الشاشة) */
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const btnClass = dark
    ? "relative grid h-9 w-9 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
    : "relative grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnClass}
        aria-label={unread ? `الإشعارات — ${unread} غير مقروءة` : "الإشعارات"}
        aria-expanded={open}
      >
        <Icon.bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -start-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 w-80 max-w-[85vw] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 ${
            up ? "bottom-full mb-2 start-0" : "top-full mt-2 end-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-bold text-slate-800">الإشعارات</span>
            {unread > 0 && (
              <form
                action={async () => {
                  await markAllNotificationsRead();
                  router.refresh();
                }}
              >
                <button className="text-xs font-semibold text-brand-600 transition hover:text-brand-700">
                  تعيين الكل كمقروء
                </button>
              </form>
            )}
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-slate-400">لا إشعارات بعد</li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href ?? "/notifications"}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-3 transition hover:bg-brand-50/60 ${
                      n.read ? "opacity-60" : ""
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">{n.title}</span>
                        <span className="mt-0.5 block text-xs text-slate-400">{fmt(n.createdAt)}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 py-2.5 text-center text-xs font-bold text-brand-600 transition hover:bg-brand-50"
          >
            عرض الكل
          </Link>
        </div>
      )}
    </div>
  );
}

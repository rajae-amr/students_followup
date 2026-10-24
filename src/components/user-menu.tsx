"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Icon } from "./ui/icons";

/** قائمة المستخدم المنسدلة — اسم + أحرف أولية، كلمة مرور وخروج */
export function UserMenu({
  name,
  role,
  dark = false,
  up = false,
}: {
  name: string;
  role: string;
  /** ألوان فاتحة — للتذييل داخل الشريط الجانبي الداكن */
  dark?: boolean;
  /** تفتح القائمة للأعلى — لموضع التذييل أسفل الشريط الجانبي */
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  const roleAr = { admin: "إدارة", staff: "إداري", teacher: "معلم", guardian: "ولي أمر" }[role] ?? role;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 transition ${
          dark ? "hover:bg-white/10" : "hover:bg-slate-100"
        }`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {initials}
        </span>
        <span className="hidden min-w-0 text-start sm:block">
          <span className={`block max-w-32 truncate text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>
            {name}
          </span>
          <span className={`block text-xs ${dark ? "text-brand-300" : "text-slate-400"}`}>{roleAr}</span>
        </span>
        <Icon.chevronDown className={`h-4 w-4 transition ${dark ? "text-brand-300" : "text-slate-400"} ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute end-0 z-50 w-48 overflow-hidden rounded-xl bg-white py-1 shadow-lift ring-1 ring-slate-200 ${
            up ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <Link
            href="/password"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Icon.key className="h-4 w-4 text-slate-400" />
            تغيير كلمة المرور
          </Link>
          <button
            role="menuitem"
            onClick={async () => {
              await authClient.signOut();
              router.refresh();
              router.push("/login");
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
          >
            <Icon.logout className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      )}
    </div>
  );
}

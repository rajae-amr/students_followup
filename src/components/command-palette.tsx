"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui/icons";

type Item = { href: string; title: string; sub?: string };
type Group = { label: string; items: Item[] };

/** أيقونة كل مجموعة نتائج */
const GROUP_ICON: Record<string, keyof typeof Icon> = {
  الطلاب: "students",
  الصفوف: "school",
  المعلمون: "users",
  صفوفي: "school",
  أبنائي: "parent",
  الصفحات: "book",
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
      {children}
    </kbd>
  );
}

/** لوحة أوامر Ctrl+K — بحث موحّد بالطلاب والصفوف والصفحات مع تنقّل بلوحة المفاتيح */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);
  const router = useRouter();

  const flat = groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.label })));

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setGroups([]);
    setActive(0);
  }, []);

  // Ctrl+K + فتح مخصص عبر حدث
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") close();
    };
    const onCustom = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onCustom);
    };
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // بحث مؤجل — مع حارس سباق: يُعتمد أحدث طلب فقط
  useEffect(() => {
    if (!q.trim()) {
      setGroups([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const seq = ++seqRef.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const j = (await r.json()) as { groups: Group[] };
        if (seq === seqRef.current) {
          setGroups(j.groups ?? []);
          setActive(0);
        }
      } catch {
        if (seq === seqRef.current) setGroups([]);
      } finally {
        if (seq === seqRef.current) setBusy(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  // تمرير العنصر النشط للرؤية عند التنقل بالأسهم
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      go(flat[active].href);
    }
  };

  if (!open) return null;

  let idx = -1;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh] backdrop-blur-sm motion-safe:animate-[page-in_.15s_ease-out]"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="بحث سريع"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* حقل البحث */}
        <div className="p-3 pb-0">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 transition focus-within:border-brand-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-100">
            <Icon.search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="ابحث عن طالب، صف، معلم، أو صفحة…"
              className="w-full bg-transparent py-3 text-[15px] outline-none placeholder:text-slate-400"
              aria-label="بحث"
            />
            {busy ? (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 motion-reduce:animate-none" />
            ) : (
              <button
                type="button"
                onClick={close}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="إغلاق"
              >
                <Icon.close className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* النتائج */}
        <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-2">
          {q.trim() && !busy && flat.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-slate-300">
                <Icon.search className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-slate-500">لا نتائج لـ«{q}»</p>
              <p className="text-xs text-slate-400">جرّب اسماً آخر أو كلمة أقصر</p>
            </div>
          )}
          {!q.trim() && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-300">
                <Icon.search className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-slate-500">بحث سريع</p>
              <p className="text-xs text-slate-400">اكتب للبحث — انتقل بالأسهم وافتح بـ Enter</p>
            </div>
          )}
          {groups.map((g) => {
            const GIcon = Icon[GROUP_ICON[g.label] ?? "book"];
            return (
              <div key={g.label} className="mb-1 last:mb-0">
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-2.5 text-[11px] font-bold text-slate-400">
                  <GIcon className="h-3.5 w-3.5" />
                  {g.label}
                  <span className="text-slate-300">({g.items.length})</span>
                </p>
                <ul>
                  {g.items.map((it) => {
                    idx++;
                    const i = idx;
                    const isActive = i === active;
                    return (
                      <li key={`${it.href}-${i}`} data-idx={i}>
                        <button
                          type="button"
                          onClick={() => go(it.href)}
                          onMouseEnter={() => setActive(i)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm transition ${
                            isActive
                              ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                              isActive ? "bg-white text-brand-600 shadow-sm" : "bg-slate-50 text-slate-400"
                            }`}
                          >
                            <GIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{it.title}</span>
                            {it.sub && <span className="block truncate text-xs text-slate-400">{it.sub}</span>}
                          </span>
                          {isActive && <Icon.arrowBack className="h-4 w-4 shrink-0 text-brand-400" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* شريط الاختصارات */}
        <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> تنقل</span>
          <span className="flex items-center gap-1"><Kbd>Enter</Kbd> فتح</span>
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd> إغلاق</span>
          <span className="ms-auto flex items-center gap-1"><Kbd>Ctrl+K</Kbd> للفتح</span>
        </div>
      </div>
    </div>
  );
}

/** زر يفتح اللوحة — يوضع في الشريط العلوي للجوال وقائمة المستخدم للمكتب */
export function SearchTrigger({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${className}`}
      aria-label="بحث (Ctrl+K)"
      title="بحث — Ctrl+K"
    >
      <Icon.search className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">بحث</span>
      <kbd className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 md:inline">Ctrl+K</kbd>
    </button>
  );
}

import { FormWithResult } from "@/components/form-result";
import { Badge } from "@/components/ui/badge";
import { NavLink } from "@/components/ui/nav-link";
import { Icon } from "@/components/ui/icons";
import { toggleUser, resetUserPassword } from "@/server/actions/admin";

export const inputClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** تبويبات أقسام المستخدمين — تظهر أعلى كل صفحات /admin/users */
export function UsersTabs() {
  const tabs = [
    { href: "/admin/users", label: "نظرة عامة", exact: true, icon: "home" as const },
    { href: "/admin/users/teachers", label: "المعلمون", exact: false, icon: "users" as const },
    { href: "/admin/users/guardians", label: "أولياء الأمور", exact: false, icon: "parent" as const },
    { href: "/admin/users/admins", label: "الإدارة", exact: false, icon: "key" as const },
    { href: "/admin/users/staff", label: "الإداريون", exact: false, icon: "users" as const },
  ];
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-soft" aria-label="أقسام المستخدمين">
      {tabs.map((t) => {
        const I = Icon[t.icon];
        return (
          <NavLink key={t.href} href={t.href} exact={t.exact}>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <I className="h-4 w-4" />
              {t.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

/** شريط بحث GET — يحافظ على الاستعلام عبر معامل ?q= */
export function SearchBar({ q, placeholder }: { q: string; placeholder: string }) {
  return (
    <form method="GET" className="mb-3 flex gap-2">
      <div className="relative flex-1 sm:max-w-xs">
        <Icon.search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
        <input
          name="q" defaultValue={q} placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pe-3 ps-9 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
        بحث
      </button>
      {q && (
        <a href="?" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50">
          مسح
        </a>
      )}
    </form>
  );
}

export function StatusCell({ u }: { u: { isActive: boolean } }) {
  return (
    <td>
      {u.isActive
        ? <Badge tone="emerald">نشط</Badge>
        : <Badge tone="red">موقوف</Badge>}
    </td>
  );
}

export function TelegramCell({ u }: { u: { telegramChatId: string | null } }) {
  return (
    <td>
      {u.telegramChatId
        ? <Badge tone="emerald">مرتبط</Badge>
        : <span className="text-xs text-slate-300">—</span>}
    </td>
  );
}

export function ActionsCell({
  u,
  deleteAction,
}: {
  u: { id: string; isActive: boolean };
  /** إن مُرّر يظهر زر «حذف نهائي» على الحسابات الموقوفة — محمي بفحص المراجع في الخادم */
  deleteAction?: (fd: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>;
}) {
  return (
    <td className="flex gap-3 py-2">
      <FormWithResult
        action={toggleUser}
        submitLabel={u.isActive ? "تعطيل" : "تفعيل"}
        bare
        buttonClass="text-xs font-semibold text-amber-600 hover:text-amber-700"
      >
        <input type="hidden" name="id" value={u.id} />
      </FormWithResult>
      <FormWithResult action={resetUserPassword} submitLabel="إعادة تعيين" bare>
        <input type="hidden" name="userId" value={u.id} />
      </FormWithResult>
      {deleteAction && !u.isActive && (
        <FormWithResult action={deleteAction} submitLabel="حذف نهائي" bare
          buttonClass="text-xs font-semibold text-red-500 hover:text-red-600">
          <input type="hidden" name="id" value={u.id} />
        </FormWithResult>
      )}
    </td>
  );
}

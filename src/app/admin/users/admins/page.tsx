import { Fragment } from "react";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { updateStaffUser } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Pagination } from "@/components/ui/pagination";
import { ActionsCell, StatusCell, TelegramCell, SearchBar, inputClass } from "../_shared";

const PAGE_SIZE = 25;

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole("admin");
  const { q = "", page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const query = q.trim();
  const where = {
    role: "admin" as const,
    ...(query && {
      OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { username: { contains: query, mode: "insensitive" as const } },
        { phone: { contains: query } },
      ],
    }),
  };
  const [admins, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader title="الإدارة" subtitle="حسابات مديري المدرسة وربط تيليجرام الإشرافي" />

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-50 text-violet-600">
            <Icon.users className="h-4 w-4" />
          </span>
          الإدارة
          <Badge tone="violet">{total}</Badge>
        </h2>
        <SearchBar q={query} placeholder="اسم المدير أو اسم المستخدم…" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-2 text-start font-semibold">الاسم</th>
                <th className="text-start font-semibold">اسم المستخدم</th>
                <th className="text-start font-semibold">الهاتف</th>
                <th className="text-start font-semibold">تيليجرام</th>
                <th className="text-start font-semibold">الحالة</th>
                <th className="text-start font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-slate-50">
                    <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                    <td dir="ltr" className="text-slate-500">{u.username ?? "—"}</td>
                    <td dir="ltr" className="text-slate-500">{u.phone ?? "—"}</td>
                    <TelegramCell u={u} />
                    <StatusCell u={u} />
                    <ActionsCell u={u} />
                  </tr>
                  <tr className="border-b border-slate-50 last:border-0">
                    <td colSpan={6} className="pb-3">
                      <details>
                        <summary className="w-fit cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-700">
                          تعديل البيانات (الاسم · الهاتف)
                        </summary>
                        <FormWithResult
                          action={updateStaffUser}
                          submitLabel="حفظ"
                          className="mt-2 flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="userId" value={u.id} />
                          <input name="name" defaultValue={u.name} required placeholder="الاسم" className={inputClass} />
                          <input name="phone" defaultValue={u.phone ?? ""} placeholder="الهاتف — مفتاح ربط البوت" dir="ltr" className={inputClass} />
                        </FormWithResult>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              ))}
              {!admins.length && (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                  {query ? `لا نتائج لـ«${query}»` : "لا حسابات"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pages} total={total} params={{ q: query }} />
      </Card>
    </div>
  );
}

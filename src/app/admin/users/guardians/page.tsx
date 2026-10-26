import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Pagination } from "@/components/ui/pagination";
import { ActionsCell, StatusCell, TelegramCell, SearchBar } from "../_shared";

const PAGE_SIZE = 25;

export default async function GuardiansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole("admin");
  const { q = "", page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const query = q.trim();

  const where = {
    role: "guardian" as const,
    ...(query && {
      OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { username: { contains: query, mode: "insensitive" as const } },
        { phone: { contains: query } },
        { guardianProfile: { is: { phone: { contains: query } } } },
      ],
    }),
  };

  const [guardians, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        guardianProfile: {
          select: {
            phone: true,
            children: { where: { verified: true }, select: { id: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader title="أولياء الأمور" subtitle="دعوات ربط الأبناء وحسابات بوابة أولياء الأمور" />

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
            <Icon.parent className="h-4 w-4" />
          </span>
          أولياء الأمور
          <Badge tone="amber">{total}</Badge>
        </h2>
        <SearchBar q={query} placeholder="اسم ولي الأمر أو اسم المستخدم أو الهاتف…" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-2 text-start font-semibold">الاسم</th>
                <th className="text-start font-semibold">اسم المستخدم</th>
                <th className="text-start font-semibold">الهاتف</th>
                <th className="text-start font-semibold">الأبناء</th>
                <th className="text-start font-semibold">تيليجرام</th>
                <th className="text-start font-semibold">الحالة</th>
                <th className="text-start font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {guardians.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">
                    <Link href={`/admin/users/guardians/${u.id}`} className="hover:text-brand-600 hover:underline">
                      {u.name}
                    </Link>
                  </td>
                  <td dir="ltr" className="text-slate-500">{u.username ?? "—"}</td>
                  <td dir="ltr" className="text-slate-500">{u.guardianProfile?.phone ?? u.phone ?? "—"}</td>
                  <td><Badge tone="brand">{u.guardianProfile?.children.length ?? 0}</Badge></td>
                  <TelegramCell u={u} />
                  <StatusCell u={u} />
                  <ActionsCell u={u} />
                </tr>
              ))}
              {!guardians.length && (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                  {query ? `لا نتائج لـ«${query}»` : "لا حسابات أولياء أمور بعد"}
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

import Link from "next/link";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 25;
const input =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

const SORTS = {
  name: { label: "الاسم", orderBy: [{ fullName: "asc" }] },
  class: { label: "الصف", orderBy: [{ enrollments: { _count: "desc" } }] },
  newest: { label: "الأحدث", orderBy: [{ createdAt: "desc" }] },
} satisfies Record<string, { label: string; orderBy: Prisma.StudentOrderByWithRelationInput[] }>;
type SortKey = keyof typeof SORTS;

/** كل الطلاب — قائمة مرقّمة قابلة للفرز والبحث عبر المدرسة كاملة */
export default async function AllStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  await requirePerm("students");
  const { q, sort, page: pageParam } = await searchParams;
  const sortKey: SortKey = sort && sort in SORTS ? (sort as SortKey) : "name";
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const where: Prisma.StudentWhereInput = {
    isActive: true,
    ...(q ? { fullName: { contains: q } } : {}),
    ...(year ? { enrollments: { some: { academicYearId: year.id } } } : {}),
  };

  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: sortKey === "class" ? [{ fullName: "asc" }] : SORTS[sortKey].orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        enrollments: {
          where: year ? { academicYearId: year.id } : {},
          take: 1,
          include: { class: { select: { id: true, displayName: true, name: true } } },
        },
      },
    }),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);

  // فرز بالصف يتم محلياً بعد الجلب (العلاقة متعددة)
  if (sortKey === "class") {
    students.sort((a, b) =>
      (a.enrollments[0]?.class.displayName ?? a.enrollments[0]?.class.name ?? "").localeCompare(
        b.enrollments[0]?.class.displayName ?? b.enrollments[0]?.class.name ?? "", "ar",
      ),
    );
  }

  const sortHref = (k: SortKey) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (k !== "name") sp.set("sort", k);
    return `?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="كل الطلاب"
        subtitle={`${total} طالباً نشطاً${year ? ` — ${year.name}` : ""}`}
        crumbs={[
          { label: "الشؤون الأكاديمية" },
          { label: "الطلاب", href: "/admin/students" },
          { label: "كل الطلاب" },
        ]}
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex items-center gap-2">
          {sortKey !== "name" && <input type="hidden" name="sort" value={sortKey} />}
          <input name="q" defaultValue={q} placeholder="ابحث باسم الطالب…" aria-label="بحث في كل الطلاب" className={`${input} flex-1`} />
          <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">بحث</button>
        </form>
      </Card>

      {students.length === 0 ? (
        <EmptyState icon="students" title={q ? "لا نتائج لهذا البحث" : "لا طلاب بعد"} hint="أضف طلاباً من صفحة الطلاب أو الاستيراد الجماعي" />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                  {(Object.keys(SORTS) as SortKey[]).map((k) => (
                    <th key={k} className="px-4 py-2.5 text-start font-bold">
                      <Link href={sortHref(k)} className={`inline-flex items-center gap-1 transition hover:text-brand-700 ${sortKey === k ? "text-brand-700" : ""}`}>
                        {SORTS[k].label}
                        {sortKey === k && <span aria-hidden>▾</span>}
                      </Link>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-start font-bold">ولي الأمر</th>
                  <th className="px-4 py-2.5 text-start font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const cls = s.enrollments[0]?.class;
                  return (
                    <tr key={s.id} className="border-b border-slate-50 transition last:border-0 hover:bg-brand-50/40">
                      <td className="px-4 py-3">
                        {cls ? (
                          <Link href={`/admin/students/${cls.id}/${s.id}`} className="font-semibold text-slate-800 hover:text-brand-700 hover:underline">
                            {s.fullName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate-800">{s.fullName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {cls ? (
                          <Link href={`/admin/students/${cls.id}`} className="text-slate-600 hover:text-brand-700 hover:underline">
                            {cls.displayName ?? cls.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.guardianName ?? "—"}
                        {s.guardianPhone && <span className="ms-2 text-xs text-slate-400" dir="ltr">{s.guardianPhone}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={s.isActive ? "emerald" : "red"}>{s.isActive ? "نشط" : "موقوف"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination page={page} pages={pages} total={total} params={{ q, sort: sortKey === "name" ? undefined : sortKey }} />
          </div>
        </Card>
      )}
    </div>
  );
}

export const metadata = { title: "كل الطلاب" };


import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import Link from "next/link";

const input =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** بوابة كشوفات الطلاب — اختر صفاً لإدارة طلابه؛ إدارة الصفوف نفسها في /admin/classes */
export default async function StudentsIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePerm("students");
  const { q } = await searchParams;
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const yearWhere = year ? { academicYearId: year.id } : {};

  const classes = await prisma.classGroup.findMany({
    where: { ...yearWhere, isActive: true },
    include: {
      grade: { select: { name: true } },
      _count: { select: { students: { where: { student: { isActive: true } } } } },
    },
    orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
  });

  // عدد أولياء الأمور المفعّلين لكل صف
  const guardianCounts = await prisma.guardianStudent.groupBy({
    by: ["studentId"],
    where: { verified: true },
    _count: { studentId: true },
  });
  const gByStudent = new Map(guardianCounts.map((g) => [g.studentId, g._count.studentId]));
  const enrolls = await prisma.enrollment.findMany({
    where: { ...yearWhere, student: { isActive: true } },
    select: { classId: true, studentId: true },
  });
  const gByClass = new Map<string, number>();
  for (const e of enrolls) {
    if (gByStudent.get(e.studentId))
      gByClass.set(e.classId, (gByClass.get(e.classId) ?? 0) + 1);
  }

  const shown = classes.filter(
    (c) => !q || c.displayName?.includes(q) || c.name.includes(q),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="الطلاب"
        subtitle={`${shown.length} صفاً نشطاً — اختر صفاً لإدارة طلابه`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/students/all"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200 transition hover:text-brand-700 hover:ring-brand-300"
            >
              <Icon.students className="h-4 w-4" />
              كل الطلاب
            </Link>
            <Link
              href="/admin/students/import"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-100"
            >
              <Icon.import className="h-4 w-4" />
              استيراد جماعي
            </Link>
          </div>
        }
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex items-center gap-2">
          <input
            name="q" defaultValue={q} placeholder="ابحث عن صف…"
            aria-label="بحث في الصفوف" className={`${input} flex-1`}
          />
          <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
            بحث
          </button>
        </form>
      </Card>

      {shown.length === 0 ? (
        <EmptyState
          icon="school"
          title={q ? "لا نتائج لهذا البحث" : "لا صفوف بعد"}
          hint={q ? "جرّب اسماً آخر" : "أضف أول صف من صفحة إدارة الصفوف"}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => {
            const guardians = gByClass.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link href={`/admin/students/${c.id}`} className="block">
                  <Card className="flex h-full items-center gap-3 p-5 transition hover:shadow-lift hover:ring-brand-200">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon.school className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-slate-800">
                        {c.displayName ?? c.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400" dir="ltr">{c.name}</span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone="brand">{c._count.students} طالباً</Badge>
                        {guardians > 0 && (
                          <Badge tone="emerald">{guardians} ولي أمر</Badge>
                        )}
                      </span>
                    </span>
                    <Icon.arrowBack className="h-4 w-4 shrink-0 text-slate-300 rtl:rotate-180" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const metadata = { title: "الطلاب" };

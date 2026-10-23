import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import type { Prisma } from "@prisma/client";
import { addClass, updateClass, deleteClass, setClassActive, moveClassStudents } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import Link from "next/link";

const input =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
const smInput =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100";
const detailsBtn =
  "text-xs font-semibold text-slate-500 transition hover:text-brand-600 open:text-brand-600";

const countSelect = {
  students: true,
  timetableSlots: true,
  assignments: true,
  lessonSessions: true,
  assessments: true,
} as const;

type ClassWithCounts = Prisma.ClassGroupGetPayload<{
  include: { _count: { select: typeof countSelect } };
}> & { verifiedGuardians?: number };

function historyCount(c: ClassWithCounts) {
  return (
    c._count.students + c._count.timetableSlots + c._count.assignments +
    c._count.lessonSessions + c._count.assessments
  );
}

/** قائمة الصفوف — إدارة كاملة: تعديل، نقل جماعي، إلغاء/تفعيل، حذف نهائي للفارغ */
export default async function ClassesIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole("admin");
  const { q } = await searchParams;
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const yearWhere = year ? { academicYearId: year.id } : {};

  const raw = await prisma.classGroup.findMany({
    where: { ...yearWhere, isActive: true },
    include: {
      _count: {
        select: {
          ...countSelect,
          students: { where: { student: { isActive: true } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const inactive = await prisma.classGroup.findMany({
    where: { ...yearWhere, isActive: false },
    include: { _count: { select: countSelect } },
    orderBy: { name: "asc" },
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

  const classes: ClassWithCounts[] = raw
    .map((c) => ({ ...c, verifiedGuardians: gByClass.get(c.id) ?? 0 }))
    .filter((c) => !q || c.displayName?.includes(q) || c.name.includes(q));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="الطلاب والصفوف"
        subtitle={`${classes.length} صفاً نشطاً — اختر صفاً لإدارة طلابه`}
        actions={
          <Link
            href="/admin/students/import"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-100"
          >
            <Icon.import className="h-4 w-4" />
            استيراد جماعي
          </Link>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        {/* بحث */}
        <Card className="p-4">
          <form method="get" className="flex items-center gap-2">
            <input
              name="q" defaultValue={q} placeholder="ابحث عن صف…"
              aria-label="بحث في الصفوف"
              className={`${input} flex-1`}
            />
            <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
              بحث
            </button>
          </form>
        </Card>
        {/* إضافة صف */}
        <Card className="p-4">
          <FormWithResult action={addClass} submitLabel="+ صف جديد">
            <div className="flex gap-2">
              <input name="name" placeholder="الرمز" required className={`${input} w-28`} dir="ltr" />
              <input name="displayName" placeholder="الاسم المعروض" required className={input} />
            </div>
          </FormWithResult>
        </Card>
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon="school"
          title={q ? "لا نتائج لهذا البحث" : "لا صفوف بعد"}
          hint={q ? "جرّب اسماً آخر" : "أضف أول صف من النموذج أعلاه"}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c: ClassWithCounts) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col p-5 transition hover:shadow-lift hover:ring-brand-200">
                <Link href={`/admin/students/${c.id}`} className="flex items-start gap-3">
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
                      {(c.verifiedGuardians ?? 0) > 0 && (
                        <Badge tone="emerald">{c.verifiedGuardians} ولي أمر</Badge>
                      )}
                    </span>
                  </span>
                </Link>

                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {/* تعديل */}
                  <details className="group">
                    <summary className={`${detailsBtn} cursor-pointer list-none`}>
                      ✎ تعديل بيانات الصف
                    </summary>
                    <FormWithResult action={updateClass} submitLabel="حفظ" className="mt-2 space-y-1.5">
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        name="name" defaultValue={c.name} required
                        aria-label="رمز الصف" className={smInput} dir="ltr" placeholder="الرمز"
                      />
                      <input
                        name="displayName" defaultValue={c.displayName ?? ""} required
                        aria-label="الاسم المعروض" className={smInput} placeholder="الاسم المعروض"
                      />
                    </FormWithResult>
                  </details>

                  {/* نقل جماعي */}
                  {c._count.students > 0 && classes.length > 1 && (
                    <details className="group">
                      <summary className={`${detailsBtn} cursor-pointer list-none`}>
                        ⇄ نقل الطلاب ({c._count.students}) لصف آخر
                      </summary>
                      <FormWithResult action={moveClassStudents} submitLabel="نقل الكل" className="mt-2 flex gap-1.5">
                        <input type="hidden" name="fromId" value={c.id} />
                        <select name="toId" required className={`${smInput} flex-1`} defaultValue="">
                          <option value="" disabled>اختر الصف الوجهة…</option>
                          {classes.filter((o) => o.id !== c.id).map((o) => (
                            <option key={o.id} value={o.id}>{o.displayName ?? o.name}</option>
                          ))}
                        </select>
                      </FormWithResult>
                    </details>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    {c._count.students > 0 ? (
                      <span className="text-xs text-slate-400" title="انقل الطلاب أولاً">
                        لا يُلغى وهو يضم طلاباً
                      </span>
                    ) : (
                      <FormWithResult
                        action={deleteClass} bare
                        buttonClass="text-xs font-semibold text-red-500 hover:text-red-600"
                        submitLabel={historyCount(c) === 0 ? "🗑 حذف نهائي" : "إلغاء التفعيل"}
                      >
                        <input type="hidden" name="id" value={c.id} />
                      </FormWithResult>
                    )}
                    <Link
                      href={`/admin/students/${c.id}`}
                      className="ms-auto text-xs font-bold text-brand-600 transition hover:text-brand-700"
                    >
                      فتح الصف ←
                    </Link>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* الصفوف المعطّلة */}
      {inactive.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-slate-400">
            صفوف معطّلة ({inactive.length})
          </h2>
          <ul className="space-y-2">
            {inactive.map((c: ClassWithCounts) => (
              <li key={c.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4 opacity-75">
                  <span className="font-semibold text-slate-500">
                    {c.displayName ?? c.name}
                  </span>
                  <span className="text-xs text-slate-400" dir="ltr">{c.name}</span>
                  <span className="ms-auto flex items-center gap-3">
                    <FormWithResult
                      action={setClassActive} bare
                      buttonClass="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                      submitLabel="✓ إعادة تفعيل"
                    >
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value="1" />
                    </FormWithResult>
                    {historyCount(c) === 0 ? (
                      <FormWithResult
                        action={deleteClass} bare
                        buttonClass="text-xs font-semibold text-red-500 hover:text-red-600"
                        submitLabel="🗑 حذف نهائي"
                      >
                        <input type="hidden" name="id" value={c.id} />
                      </FormWithResult>
                    ) : (
                      <span className="text-xs text-slate-300" title="للصف سجل تاريخي محفوظ">
                        له سجلات — لا يُحذف نهائياً
                      </span>
                    )}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

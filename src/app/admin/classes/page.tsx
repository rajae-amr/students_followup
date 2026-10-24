import { requirePerm } from "@/server/session";
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
  "cursor-pointer list-none text-xs font-semibold text-slate-500 transition hover:text-brand-600 open:text-brand-600";

const countSelect = {
  students: true,
  timetableSlots: true,
  assignments: true,
  lessonSessions: true,
  assessments: true,
} as const;

type ClassRow = Prisma.ClassGroupGetPayload<{
  include: { _count: { select: typeof countSelect }; grade: { select: { name: true } } };
}>;

function historyCount(c: ClassRow) {
  return (
    c._count.students + c._count.timetableSlots + c._count.assignments +
    c._count.lessonSessions + c._count.assessments
  );
}

/** إدارة الصفوف — إضافة/تعديل/حذف شعبة، نقل طلابها، ربطها بالمستوى الصفّي */
export default async function ClassesPage() {
  await requirePerm("students");
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const yearWhere = year ? { academicYearId: year.id } : {};

  const [grades, classes, inactive] = await Promise.all([
    prisma.gradeLevel.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.classGroup.findMany({
      where: { ...yearWhere, isActive: true },
      include: {
        _count: { select: { ...countSelect, students: { where: { student: { isActive: true } } } } },
        grade: { select: { name: true } },
      },
      orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
    }),
    prisma.classGroup.findMany({
      where: { ...yearWhere, isActive: false },
      include: {
        _count: { select: countSelect },
        grade: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // تجميع الشعب تحت مستواها الصفّي (الشعب بلا مستوى في مجموعة أخيرة)
  const groups: { title: string; items: ClassRow[] }[] = [];
  for (const c of classes) {
    const title = c.grade?.name ?? "بدون مستوى";
    const g = groups.find((x) => x.title === title);
    if (g) g.items.push(c);
    else groups.push({ title, items: [c] });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="إدارة الصفوف"
        subtitle={`${classes.length} صفاً نشطاً في ${year?.name ?? "العام الحالي"} — إضافة وتعديل وحذف الشعب`}
      />

      {/* إضافة صف جديد */}
      <Card className="mb-6 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon.school className="h-4 w-4" />
          </span>
          صف جديد
        </h2>
        <FormWithResult action={addClass} submitLabel="+ إضافة الصف">
          <div className="flex flex-wrap gap-2">
            <input
              name="name" placeholder="الرمز — G6-GEN-3L" required
              className={`${input} w-36`} dir="ltr"
            />
            <input
              name="displayName" placeholder="الاسم المعروض — الصف السادس - شعبة 3" required
              className={`${input} flex-1`}
            />
            <select name="gradeId" className={input} defaultValue="">
              <option value="">المستوى الصفّي…</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </FormWithResult>
        <p className="mt-2 text-xs text-slate-400">
          المستوى الصفّي يحدد ترتيب الصف في القوائم ومصفوفة التغطية — اختياري.
        </p>
      </Card>

      {classes.length === 0 ? (
        <EmptyState icon="school" title="لا صفوف نشطة" hint="أضف أول صف من النموذج أعلاه" />
      ) : (
        groups.map((g) => (
          <section key={g.title} className="mb-8 last:mb-0 rounded-3xl bg-gradient-to-b from-slate-100/80 to-slate-50 p-4 ring-1 ring-slate-200/60 sm:p-5">
            <h2 className="mb-4 flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-sm font-extrabold text-white shadow-soft">
                {g.items.length}
              </span>
              <span className="text-base font-extrabold text-slate-800">{g.title}</span>
              <span className="h-px flex-1 bg-slate-200" aria-hidden />
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((c) => (
                <li key={c.id}>
                  <Card className="flex h-full flex-col p-4 transition hover:shadow-lift hover:ring-brand-200">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                        <Icon.school className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-800">{c.displayName ?? c.name}</p>
                        <p className="mt-0.5 text-xs text-slate-400" dir="ltr">{c.name}</p>
                      </div>
                      <Badge tone="brand">{c._count.students} طالباً</Badge>
                    </div>

                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      {/* تعديل */}
                      <details className="group">
                        <summary className={detailsBtn}>✎ تعديل البيانات</summary>
                        <FormWithResult action={updateClass} submitLabel="حفظ" className="mt-2 space-y-1.5">
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            name="name" defaultValue={c.name} required dir="ltr"
                            aria-label="رمز الصف" className={smInput} placeholder="الرمز"
                          />
                          <input
                            name="displayName" defaultValue={c.displayName ?? ""} required
                            aria-label="الاسم المعروض" className={smInput} placeholder="الاسم المعروض"
                          />
                          <select name="gradeId" defaultValue={c.gradeId ?? ""} className={smInput} aria-label="المستوى الصفّي">
                            <option value="">بدون مستوى</option>
                            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </FormWithResult>
                      </details>

                      {/* نقل الطلاب */}
                      {c._count.students > 0 && classes.length > 1 && (
                        <details className="group">
                          <summary className={detailsBtn}>
                            ⇄ نقل الطلاب ({c._count.students}) لصف آخر
                          </summary>
                          <FormWithResult action={moveClassStudents} submitLabel="نقل الكل" className="mt-2 flex gap-1.5">
                            <input type="hidden" name="fromId" value={c.id} />
                            <select name="toId" required className={`${smInput} flex-1`} defaultValue="">
                              <option value="" disabled>الصف الوجهة…</option>
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
                          فتح الطلاب ←
                        </Link>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* الصفوف المعطّلة */}
      {inactive.length > 0 && (
        <section className="mt-8 rounded-3xl border border-dashed border-slate-300 p-4 sm:p-5">
          <h2 className="mb-4 flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-300 text-sm font-extrabold text-white">
              {inactive.length}
            </span>
            <span className="text-base font-extrabold text-slate-500">صفوف معطّلة</span>
            <span className="h-px flex-1 bg-slate-200" aria-hidden />
          </h2>
          <ul className="space-y-2">
            {inactive.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4 opacity-75">
                  <span className="font-semibold text-slate-500">{c.displayName ?? c.name}</span>
                  <span className="text-xs text-slate-400" dir="ltr">{c.name}</span>
                  {c.grade?.name && <Badge tone="slate">{c.grade.name}</Badge>}
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

import Link from "next/link";
import { prisma } from "@app/db";
import { requirePerm } from "@/server/session";
import { addSubject } from "@/server/actions/admin";
import { renameSubjectAction, toggleSubjectAction, setSubjectWeightsAction } from "@/server/actions/subjects";
import { parseGradeWeights } from "@app/core";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
const inputSm =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100";

/** إدارة المواد الدراسية — قائمة مواد المدرسة فقط؛ الإسنادات في صفحة مستقلة */
export default async function SubjectsAdminPage() {
  await requirePerm("timetable");

  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: { where: { isActive: true } } } } },
  });
  const activeCount = subjects.filter((s) => s.isActive).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="المواد الدراسية"
        subtitle={`${activeCount} مادة نشطة — إدارة قائمة مواد المدرسة وألوانها`}
        crumbs={[{ label: "الهيكل الأكاديمي" }, { label: "المواد" }]}
        actions={
          <Link
            href="/admin/assignments"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-100"
          >
            إسنادات التدريس ←
          </Link>
        }
      />

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.book className="h-5 w-5 text-brand-600" />
          المواد
          <Badge tone="brand">{subjects.length}</Badge>
        </h2>

        <FormWithResult action={addSubject} submitLabel="إضافة" className="!mt-0 mb-3">
          <input name="name" placeholder="اسم المادة الجديدة" required className={input} />
        </FormWithResult>

        {subjects.length === 0 ? (
          <EmptyState icon="book" title="لا مواد بعد" hint="أضف أول مادة من النموذج أعلاه" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {subjects.map((s) => {
              const w = parseGradeWeights(s.gradeWeights);
              const wTotal = w ? Object.values(w).reduce((a, b) => a + (b ?? 0), 0) : 0;
              return (
                <li key={s.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <FormWithResult action={renameSubjectAction} submitLabel="حفظ" bare className="flex flex-1 items-center gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <input
                        type="color" name="color" defaultValue={s.color ?? "#64748b"}
                        title="لون المادة" className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-slate-200"
                      />
                      <input name="name" defaultValue={s.name} required className={inputSm} />
                      <input name="code" defaultValue={s.code ?? ""} placeholder="رمز" title="رمز المادة" className={`${inputSm} w-16`} dir="ltr" />
                    </FormWithResult>
                    <Badge tone="slate">{s._count.assignments} إسناداً</Badge>
                    {!s.isActive && <Badge tone="slate">معطّلة</Badge>}
                    <FormWithResult
                      action={toggleSubjectAction} submitLabel={s.isActive ? "تعطيل" : "تفعيل"} bare
                      buttonClass={`shrink-0 text-xs font-semibold ${s.isActive ? "text-red-500 hover:text-red-600" : "text-emerald-600 hover:text-emerald-700"}`}
                    >
                      <input type="hidden" name="id" value={s.id} />
                    </FormWithResult>
                  </div>
                  <details className="mt-1">
                    <summary className="w-fit cursor-pointer text-xs font-semibold text-slate-400 hover:text-brand-600">
                      أوزان الدرجات {w ? `(المجموع ${wTotal}%)` : "— افتراضية"}
                    </summary>
                    <FormWithResult
                      action={setSubjectWeightsAction} submitLabel="حفظ الأوزان"
                      className="mt-2 rounded-xl bg-slate-50 p-3"
                    >
                      <input type="hidden" name="id" value={s.id} />
                      <div className="flex flex-wrap items-end gap-2">
                        {([["exam", "اختبار"], ["quiz", "قصير"], ["homework", "واجب"], ["participation", "مشاركة"]] as const).map(([k, ar]) => (
                          <label key={k} className="text-[11px] font-semibold text-slate-500">
                            {ar}%
                            <input
                              name={k} type="number" min={0} max={100} step="0.5" dir="ltr"
                              defaultValue={w?.[k] ?? ""} placeholder="0"
                              className="mt-0.5 block w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs focus:border-brand-400 focus:outline-none"
                            />
                          </label>
                        ))}
                        <span className="pb-1.5 text-[11px] text-slate-400">
                          فارغ/0 = بلا وزن · مجموع موجب يفعّل الموزون، وإلا افتراضي (اختبار+قصير)
                        </span>
                      </div>
                    </FormWithResult>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export const metadata = { title: "المواد" };

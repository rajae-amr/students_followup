import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { addSubject } from "@/server/actions/admin";
import {
  renameSubjectAction, toggleSubjectAction,
  assignSubjectAction, unassignSubjectAction, reassignSubjectAction,
} from "@/server/actions/subjects";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
const inputSm =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export default async function SubjectsAdminPage() {
  await requireRole("admin");

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const [subjects, teachers, classes, assignments] = await Promise.all([
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: "teacher", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.classGroup.findMany({
      where: { academicYearId: year?.id, isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, name: true },
    }),
    prisma.teachingAssignment.findMany({
      where: { academicYearId: year?.id },
      include: {
        subject: { select: { name: true, isActive: true } },
        class: { select: { displayName: true, name: true } },
      },
      orderBy: [{ subject: { name: "asc" } }, { classId: "asc" }],
    }),
  ]);
  const teacherNames = new Map(teachers.map((t) => [t.id, t.name]));
  const activeSubjects = subjects.filter((s) => s.isActive);
  const active = assignments.filter((a) => a.isActive);
  const inactive = assignments.filter((a) => !a.isActive);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="المواد والإسنادات"
        subtitle="قائمة مواد المدرسة وربطها بالمعلمين والصفوف — تظهر للمعلم في خططه ودرجاته"
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* المواد */}
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.book className="h-5 w-5 text-brand-600" />
            المواد الدراسية
            <Badge tone="brand">{activeSubjects.length}</Badge>
          </h2>

          <FormWithResult action={addSubject} submitLabel="إضافة" className="!mt-0 mb-3">
            <input name="name" placeholder="اسم المادة الجديدة" required className={input} />
          </FormWithResult>

          <ul className="divide-y divide-slate-100">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2">
                <FormWithResult action={renameSubjectAction} submitLabel="حفظ" bare className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="name" defaultValue={s.name} required className={inputSm} />
                </FormWithResult>
                {!s.isActive && <Badge tone="slate">معطّلة</Badge>}
                <FormWithResult
                  action={toggleSubjectAction} submitLabel={s.isActive ? "تعطيل" : "تفعيل"} bare
                  buttonClass={`shrink-0 text-xs font-semibold ${s.isActive ? "text-red-500 hover:text-red-600" : "text-emerald-600 hover:text-emerald-700"}`}
                >
                  <input type="hidden" name="id" value={s.id} />
                </FormWithResult>
              </li>
            ))}
          </ul>
        </Card>

        {/* إسناد جديد */}
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600">+</span>
            إسناد مادة لمعلم
          </h2>
          <FormWithResult action={assignSubjectAction} submitLabel="إسناد">
            <div className="grid w-full gap-2">
              <select name="teacherId" required className={input}>
                <option value="">المعلم…</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select name="classId" required className={input}>
                <option value="">الصف…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.displayName ?? c.name}</option>)}
              </select>
              <select name="subjectId" required className={input}>
                <option value="">المادة…</option>
                {activeSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </FormWithResult>
          <p className="mt-3 text-xs text-slate-400">
            الإسناد يحدد ما يظهر للمعلم في الخطة الأسبوعية والدرجات والتقييم — ويُنشأ
            تلقائياً أيضاً عند إسناد حصة في الجدول.
          </p>
        </Card>
      </div>

      {/* الإسنادات النشطة */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.users className="h-5 w-5 text-brand-600" />
          الإسنادات النشطة
          <Badge tone="brand">{active.length}</Badge>
        </h2>
        {active.length === 0 ? (
          <EmptyState icon="schedule" title="لا إسنادات بعد" hint="أسند مادة لمعلم من النموذج أعلاه أو عبر الجدول" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">المعلم</th>
                  <th className="text-start font-semibold">الصف</th>
                  <th className="text-start font-semibold">المادة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {active.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-800">{teacherNames.get(a.teacherId) ?? "—"}</td>
                    <td className="text-slate-600">{a.class.displayName ?? a.class.name}</td>
                    <td className="text-slate-600">
                      {a.subject.name}
                      {!a.subject.isActive && <Badge tone="slate">معطّلة</Badge>}
                    </td>
                    <td>
                      <FormWithResult action={unassignSubjectAction} submitLabel="إلغاء الإسناد" bare
                        buttonClass="text-xs font-semibold text-red-500 transition hover:text-red-600">
                        <input type="hidden" name="id" value={a.id} />
                      </FormWithResult>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* المعطّلة */}
      {inactive.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold text-slate-600">إسنادات معطّلة</h2>
          <ul className="divide-y divide-slate-100">
            {inactive.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm text-slate-500">
                <span>
                  {teacherNames.get(a.teacherId) ?? "—"} — {a.class.displayName ?? a.class.name} — {a.subject.name}
                </span>
                <FormWithResult action={reassignSubjectAction} submitLabel="إعادة تفعيل" bare
                  buttonClass="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  <input type="hidden" name="id" value={a.id} />
                </FormWithResult>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

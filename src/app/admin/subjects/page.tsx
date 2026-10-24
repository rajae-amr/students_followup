import Link from "next/link";
import { prisma } from "@app/db";
import { requirePerm } from "@/server/session";
import { addSubject } from "@/server/actions/admin";
import {
  renameSubjectAction, toggleSubjectAction,
  assignSubjectAction, unassignSubjectAction, reassignSubjectAction, deleteAssignmentAction,
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

export default async function SubjectsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string; class?: string; subject?: string }>;
}) {
  await requirePerm("timetable");
  const { teacher: fTeacher, class: fClass, subject: fSubject } = await searchParams;
  const filtered = !!(fTeacher || fClass || fSubject);

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
        subject: { select: { name: true, isActive: true, color: true } },
        class: { select: { displayName: true, name: true } },
      },
      orderBy: [{ subject: { name: "asc" } }, { class: { displayName: "asc" } }],
    }),
  ]);
  const teacherNames = new Map(teachers.map((t) => [t.id, t.name]));
  const activeSubjects = subjects.filter((s) => s.isActive);
  const active = assignments.filter((a) => a.isActive);
  const inactive = assignments.filter((a) => !a.isActive);

  // الفلترة
  const shown = active.filter((a) =>
    (!fTeacher || a.teacherId === fTeacher) &&
    (!fClass || a.classId === fClass) &&
    (!fSubject || a.subjectId === fSubject));

  // تجميع: معلم → مادة → إسنادات (شعبه)
  type Asg = (typeof shown)[number];
  const byTeacher = new Map<string, Map<string, Asg[]>>();
  for (const a of shown) {
    if (!byTeacher.has(a.teacherId)) byTeacher.set(a.teacherId, new Map());
    const subjMap = byTeacher.get(a.teacherId)!;
    if (!subjMap.has(a.subject.name)) subjMap.set(a.subject.name, []);
    subjMap.get(a.subject.name)!.push(a);
  }
  const teacherGroups = [...byTeacher.entries()]
    .sort((x, y) => (teacherNames.get(x[0]) ?? "").localeCompare(teacherNames.get(y[0]) ?? "", "ar"));

  const shortClass = (c: { displayName: string | null; name: string }) =>
    (c.displayName ?? c.name).replace("الصف ", "");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="المواد والإسنادات"
        subtitle="قائمة مواد المدرسة وربطها بالمعلمين والصفوف — تظهر للمعلم في خططه ودرجاته"
      />
      <Link href="/admin/subjects/coverage" className="mb-4 inline-block rounded-xl bg-accent-50 px-4 py-2 text-xs font-bold text-accent-700 ring-1 ring-accent-200 hover:bg-accent-100">
        مصفوفة التوزيع والتغطية ←
      </Link>

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
                  <input
                    type="color" name="color" defaultValue={s.color ?? "#64748b"}
                    title="لون المادة" className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-slate-200"
                  />
                  <input name="name" defaultValue={s.name} required className={inputSm} />
                  <input name="code" defaultValue={s.code ?? ""} placeholder="رمز" title="رمز المادة" className={`${inputSm} w-16`} dir="ltr" />
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

      {/* الإسنادات النشطة — فلترة + تجميع حسب المعلم */}
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold text-slate-800">
            <Icon.users className="h-5 w-5 text-brand-600" />
            الإسنادات النشطة
            <Badge tone="brand">{shown.length}{filtered ? `/${active.length}` : ""}</Badge>
          </h2>
          {filtered && (
            <Link href="/admin/subjects" className="text-xs font-bold text-brand-600 hover:underline">
              ✕ مسح الفلتر — عرض الكل
            </Link>
          )}
        </div>

        {/* شريط الفلترة */}
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
          <select name="teacher" defaultValue={fTeacher ?? ""} className={input}>
            <option value="">كل المعلمين</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select name="class" defaultValue={fClass ?? ""} className={input}>
            <option value="">كل الصفوف</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.displayName ?? c.name}</option>)}
          </select>
          <select name="subject" defaultValue={fSubject ?? ""} className={input}>
            <option value="">كل المواد</option>
            {activeSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="submit" className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white">
            تصفية
          </button>
        </form>

        {shown.length === 0 ? (
          <EmptyState icon="schedule" title={filtered ? "لا نتائج مطابقة" : "لا إسنادات بعد"}
            hint={filtered ? "جرّب توسيع الفلتر" : "أسند مادة لمعلم من النموذج أعلاه"} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {teacherGroups.map(([teacherId, subjMap]) => {
              const count = [...subjMap.values()].reduce((s, l) => s + l.length, 0);
              return (
                <div key={teacherId} className="rounded-xl border border-slate-150 bg-slate-50/60 p-3 ring-1 ring-slate-100">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">{teacherNames.get(teacherId) ?? "—"}</h3>
                    <Badge tone="slate">{count} إسناداً</Badge>
                  </div>
                  <div className="space-y-2">
                    {[...subjMap.entries()].map(([subjName, list]) => (
                      <div key={subjName} className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="inline-flex w-28 shrink-0 items-center gap-1 text-xs font-semibold text-slate-600"
                          title={subjName}
                        >
                          <i className="h-2 w-2 rounded-full" style={{ backgroundColor: list[0]!.subject.color ?? "#64748b" }} />
                          <span className="truncate">{subjName}</span>
                          {!list[0]!.subject.isActive && <Badge tone="slate">معطّلة</Badge>}
                        </span>
                        {list.map((a) => (
                          <span key={a.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                            {shortClass(a.class)}
                            <FormWithResult action={unassignSubjectAction} submitLabel="×" bare
                              buttonClass="font-bold text-red-400 hover:text-red-600 leading-none">
                              <input type="hidden" name="id" value={a.id} />
                            </FormWithResult>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
                <span className="flex shrink-0 gap-3">
                  <FormWithResult action={reassignSubjectAction} submitLabel="إعادة تفعيل" bare
                    buttonClass="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                    <input type="hidden" name="id" value={a.id} />
                  </FormWithResult>
                  <FormWithResult action={deleteAssignmentAction} submitLabel="حذف نهائي" bare
                    buttonClass="text-xs font-semibold text-red-400 hover:text-red-600">
                    <input type="hidden" name="id" value={a.id} />
                  </FormWithResult>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

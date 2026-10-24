import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { assessmentsForTeacher } from "@app/core";
import { createAssessmentAction } from "@/server/actions/grades";
import { FormWithResult } from "@/components/form-result";
import { GradeCell } from "./grade-cell";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import type { Prisma } from "@prisma/client";

const KIND_AR: Record<string, string> = {
  quiz: "اختبار قصير", homework: "واجب", exam: "اختبار", participation: "مشاركة",
};
const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string }>;
}) {
  const actor = await requireRole("teacher");
  const { assessment: selectedId } = await searchParams;

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const [assignments, terms, assessments] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: { teacherId: actor.userId, academicYearId: year?.id, isActive: true },
      include: { class: { select: { displayName: true } }, subject: { select: { name: true } } },
    }),
    prisma.term.findMany({
      where: { academicYearId: year?.id },
      orderBy: { startDate: "asc" },
    }),
    assessmentsForTeacher(actor, {}),
  ]);

  const selected = assessments.find((a) => a.id === selectedId) ?? null;
  const roster = selected
    ? await prisma.enrollment.findMany({
        where: { classId: selected.classId, academicYearId: year?.id, student: { isActive: true } },
        include: { student: { select: { id: true, fullName: true } } },
        orderBy: { student: { fullName: "asc" } },
      })
    : [];
  const grades = selected
    ? await prisma.grade.findMany({ where: { assessmentId: selected.id } })
    : [];
  const gradeMap = new Map(grades.map((g) => [g.studentId, g.score]));

  const classOpts = [...new Map(assignments.map((a) => [a.classId, a.class.displayName])).entries()];
  const subjectOpts = [...new Map(assignments.map((a) => [a.subjectId, a.subject.name])).entries()];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="الدرجات"
        subtitle="إنشاء التقييمات ورصد درجات طلاب صفوفك"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* قائمة التقييمات */}
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon.grades className="h-5 w-5 text-brand-600" />
              تقييماتي
              <Badge tone="brand">{assessments.length}</Badge>
            </h2>
            {assessments.length === 0 ? (
              <EmptyState icon="grades" title="لا تقييمات بعد" hint="أنشئ تقييمك الأول من النموذج" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {assessments.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/teacher/grades?assessment=${a.id}`}
                      className={`group flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-sm transition hover:bg-brand-50/50 ${
                        a.id === selectedId ? "bg-brand-50 font-bold text-brand-700" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-800 group-hover:text-brand-700">
                          {a.title}
                        </span>
                        <span className="text-xs text-slate-500">
                          {a.class.displayName} · {a.subject.name} · {KIND_AR[a.kind] ?? a.kind}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400" dir="ltr">
                        /{a.maxScore} · {a._count.grades}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* رصد الدرجات */}
          {selected && (
            <Card>
              <h2 className="mb-1 font-bold text-slate-800">
                رصد: {selected.title}
                <span className="ms-2 text-sm font-normal text-slate-500">
                  {selected.class.displayName} — من {selected.maxScore}
                </span>
              </h2>
              <p className="mb-4 text-xs text-slate-400">
                تُحفظ الدرجة عند مغادرة الخلية — الإطار الأخضر = محفوظة في الخادم
              </p>
              <ul className="divide-y divide-slate-100">
                {roster.map((
                  e: Prisma.EnrollmentGetPayload<{ include: { student: { select: { id: true; fullName: true } } } }>,
                  i: number,
                ) => (
                  <li key={e.studentId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                        {i + 1}
                      </span>
                      <span className="font-medium text-slate-800">{e.student.fullName}</span>
                    </span>
                    <GradeCell
                      assessmentId={selected.id}
                      studentId={e.studentId}
                      studentName={e.student.fullName}
                      initialScore={gradeMap.get(e.studentId) ?? null}
                      maxScore={selected.maxScore}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* إنشاء تقييم */}
        <Card className="h-fit lg:sticky lg:top-36">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600">+</span>
            تقييم جديد
          </h2>
          <FormWithResult action={createAssessmentAction} submitLabel="إنشاء التقييم">
            <div className="grid gap-2">
              <select name="classId" required className={input}>
                <option value="">الصف…</option>
                {classOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <select name="subjectId" required className={input}>
                <option value="">المادة…</option>
                {subjectOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select name="termId" className={input}>
                  <option value="">بدون فصل</option>
                  {terms.map((t: { id: string; name: string }) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select name="kind" className={input}>
                  {Object.entries(KIND_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <input name="title" placeholder="العنوان" required className={input} />
              <div className="grid grid-cols-2 gap-2">
                <input name="date" type="date" required className={input} />
                <input name="maxScore" type="number" min={1} placeholder="العظمى" required className={input} />
              </div>
            </div>
          </FormWithResult>
          {!assignments.length && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              لا إسنادات لك بعد — راجع الإدارة.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import { parseGradeWeights } from "@app/core";
import { createAssessmentAction } from "@/server/actions/grades";
import { FormWithResult } from "@/components/form-result";
import { Gradebook } from "./gradebook";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const KIND_AR: Record<string, string> = {
  quiz: "اختبار قصير", homework: "واجب", exam: "اختبار", participation: "مشاركة",
};
const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** دفتر الدرجات — مصفوفة طلاب×تقييمات لكل (صف×مادة) مسندة للمعلم */
export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{ pair?: string }>;
}) {
  const actor = await requireRole("teacher");
  const { pair } = await searchParams;

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const assignments = await prisma.teachingAssignment.findMany({
    where: { teacherId: actor.userId, academicYearId: year?.id, isActive: true },
    include: {
      class: { select: { displayName: true, name: true } },
      subject: { select: { id: true, name: true, gradeWeights: true } },
    },
    orderBy: [{ class: { displayName: "asc" } }, { subject: { name: "asc" } }],
  });

  // أزواج (صف×مادة) المتاحة للمعلم
  const combos = assignments.map((a) => ({
    key: `${a.classId}|${a.subjectId}`,
    classId: a.classId,
    subjectId: a.subjectId,
    label: `${a.class.displayName ?? a.class.name} — ${a.subject.name}`,
    weights: parseGradeWeights(a.subject.gradeWeights),
  }));
  const sel = combos.find((c) => c.key === pair) ?? combos[0] ?? null;

  const [terms, roster, assessments] = sel
    ? await Promise.all([
        prisma.term.findMany({
          where: { academicYearId: year?.id },
          orderBy: { startDate: "asc" },
          select: { id: true, name: true },
        }),
        prisma.enrollment.findMany({
          where: { classId: sel.classId, academicYearId: year?.id, student: { isActive: true } },
          include: { student: { select: { id: true, fullName: true } } },
          orderBy: { student: { fullName: "asc" } },
        }),
        prisma.assessment.findMany({
          where: { teacherId: actor.userId, classId: sel.classId, subjectId: sel.subjectId },
          orderBy: { date: "asc" },
          include: { grades: { select: { studentId: true, score: true, status: true } } },
        }),
      ])
    : [[], [], []];

  const cols = (assessments as {
    id: string; title: string; kind: string; date: Date; maxScore: number;
    publishedAt: Date | null;
    grades: { studentId: string; score: number | null; status: string }[];
  }[]).map((a) => ({
    id: a.id,
    title: a.title,
    kind: a.kind,
    date: a.date.toISOString(),
    maxScore: a.maxScore,
    published: a.publishedAt != null,
    grades: Object.fromEntries(
      a.grades.map((g) => [g.studentId, { score: g.score, status: g.status }]),
    ),
  }));
  const drafts = cols.filter((c) => !c.published).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="دفتر الدرجات" subtitle="مصفوفة الرصد — درجاتك لكل تقييمات الصف والمادة في جدول واحد" />

      {/* اختيار صف×مادة */}
      {combos.length === 0 ? (
        <Card>
          <EmptyState icon="grades" title="لا إسنادات لك بعد" hint="راجع الإدارة لإسناد مواد وصفوف إليك" />
        </Card>
      ) : (
        <>
          <Card className="mb-4 p-4">
            <form method="get" className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-bold text-slate-700">الصف — المادة:</label>
              <select name="pair" defaultValue={sel?.key} className={`${input} min-w-64`}>
                {combos.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
                عرض الدفتر
              </button>
              {drafts > 0 && (
                <Badge tone="amber">{drafts} تقييماً مسودة — لا تظهر في التقارير</Badge>
              )}
            </form>
          </Card>

          {/* تقييم جديد — يضيف عموداً للدفتر */}
          <Card className="mb-4">
            <details>
              <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-slate-800">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600">+</span>
                تقييم جديد في هذا الدفتر
                <span className="text-xs font-normal text-slate-400">({sel?.label})</span>
              </summary>
              <FormWithResult action={createAssessmentAction} submitLabel="إنشاء التقييم" className="mt-3">
                <input type="hidden" name="classId" value={sel!.classId} />
                <input type="hidden" name="subjectId" value={sel!.subjectId} />
                <div className="grid w-full gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <input name="title" placeholder="العنوان — اختبار الوحدة 2" required className={`${input} sm:col-span-2`} />
                  <select name="kind" className={input}>
                    {Object.entries(KIND_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input name="date" type="date" required className={input} />
                  <input name="maxScore" type="number" min={1} placeholder="العظمى" required className={input} dir="ltr" />
                  <select name="termId" className={input}>
                    <option value="">بدون فصل</option>
                    {(terms as { id: string; name: string }[]).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <label className="mt-1 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-700">
                  <input type="checkbox" name="publish" defaultChecked className="h-4 w-4 accent-emerald-600" />
                  نشر فوراً — يظهر في التقارير وبوابة أولياء الأمور
                </label>
              </FormWithResult>
            </details>
          </Card>

          {/* المصفوفة */}
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon.grades className="h-5 w-5 text-brand-600" />
              {sel?.label}
              <Badge tone="brand">{cols.length} تقييماً</Badge>
              <Badge tone="slate">{(roster as { studentId: string }[]).length} طالباً</Badge>
            </h2>
            {cols.length === 0 ? (
              <EmptyState icon="grades" title="لا تقييمات بعد" hint="أنشئ أول تقييم من النموذج أعلاه ليظهر كعمود هنا" />
            ) : (
              <Gradebook
                students={(roster as { student: { id: string; fullName: string } }[]).map((e) => e.student)}
                assessments={cols}
                classId={sel!.classId}
                subjectId={sel!.subjectId}
                weights={sel!.weights}
                terms={terms as { id: string; name: string }[]}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export const metadata = { title: "دفتر الدرجات" };

import Link from "next/link";
import { Fragment } from "react";
import { prisma } from "@app/db";
import { requirePerm } from "@/server/session";
import { specializationKey } from "@app/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssignCell } from "./assign-cell";

/**
 * مصفوفة التوزيع والتغطية — مادة × شعبة:
 * كل خلية تعرض المعلم المسند، أو «فجوة» إن كانت المادة مطلوبة بلا معلم.
 * القائمة تقدّم متخصصي المادة (★) ثم بقية المعلمين.
 */
export default async function CoveragePage() {
  await requirePerm("timetable");
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return null;

  const [grades, looseClasses, subjects, teachers, assignments, quotas] = await Promise.all([
    prisma.gradeLevel.findMany({
      orderBy: { order: "asc" },
      include: {
        classes: { where: { academicYearId: year.id, isActive: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.classGroup.findMany({ where: { academicYearId: year.id, isActive: true, gradeId: null } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: "teacher", isActive: true },
      include: { teacherProfile: true },
      orderBy: { name: "asc" },
    }),
    prisma.teachingAssignment.findMany({ where: { academicYearId: year.id, isActive: true } }),
    prisma.subjectGradeQuota.findMany(),
  ]);

  const quotaOf = new Map(quotas.map((q) => [`${q.subjectId}|${q.gradeId}`, q.weeklyPeriods] as const));
  const byCell = new Map<string, string[]>();
  for (const a of assignments) {
    const k = `${a.subjectId}|${a.classId}`;
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k)!.push(a.teacherId);
  }

  // متخصصو كل مادة أولاً (تخصص الملف أو المادة الافتراضية)، ثم البقية أبجدياً
  const optionsOf = (subjectName: string) => {
    const key = specializationKey(subjectName);
    const spec = (t: (typeof teachers)[number]) =>
      specializationKey(t.teacherProfile?.specialization ?? t.teacherProfile?.defaultSubject) === key;
    const specialists = teachers.filter(spec);
    const rest = teachers.filter((t) => !spec(t));
    return {
      hasSpecialist: specialists.length > 0,
      options: [
        ...specialists.map((t) => ({ id: t.id, name: t.name, specialist: true })),
        ...rest.map((t) => ({ id: t.id, name: t.name, specialist: false })),
      ],
    };
  };

  // إحصاء الفجوات: خلايا (مادة×شعبة) نصابها > 0 بلا معلم
  let cells = 0, gaps = 0;
  const gradeRows = [
    ...grades.map((g) => ({ name: g.name, gradeId: g.id, classes: g.classes })),
    ...(looseClasses.length ? [{ name: "صفوف بلا مستوى", gradeId: "", classes: looseClasses }] : []),
  ];
  for (const g of gradeRows)
    for (const c of g.classes)
      for (const s of subjects)
        if ((quotaOf.get(`${s.id}|${g.gradeId}`) ?? 0) > 0) {
          cells++;
          if (!byCell.get(`${s.id}|${c.id}`)?.length) gaps++;
        }

  const shortClass = (n: string) => n.replace("الصف ", "");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="التوزيع والتغطية"
        subtitle={
          gaps === 0
            ? `${cells} خلية تدريسية — التغطية مكتملة ✅`
            : `${gaps} فجوة من ${cells} خلية تدريسية — الخلايا الكهرمانية تحتاج معلماً`
        }
      />
      <Link href="/admin/subjects" className="mb-4 inline-block text-xs font-bold text-brand-600 hover:underline">
        ← رجوع للمواد والإسنادات
      </Link>

      <Card>
        <p className="mb-3 text-xs text-slate-500">
          كل خلية = مادة × شعبة. ★ = متخصص المادة (تخصصه يطابق اسمها). اختيار معلم يستبدل المسند حالياً.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="sticky start-0 z-10 min-w-28 bg-slate-50 p-2 text-start text-xs font-bold text-slate-500">
                  الشعبة
                </th>
                {subjects.map((s) => (
                  <th key={s.id} className="min-w-32 border-e border-slate-100 p-2 text-center font-medium last:border-e-0">
                    <span
                      className="inline-block rounded-lg px-2 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: s.color ?? "#64748b" }}
                    >
                      {s.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gradeRows.map((g) => (
                <Fragment key={g.gradeId || "loose"}>
                  <tr className="bg-slate-100/60">
                    <td colSpan={subjects.length + 1} className="sticky start-0 px-2 py-1 text-xs font-bold text-slate-500">
                      {g.name} <Badge tone="slate">{g.classes.length}</Badge>
                    </td>
                  </tr>
                  {g.classes.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="sticky start-0 z-10 bg-white p-2 text-xs font-bold text-slate-700 whitespace-nowrap">
                        {shortClass(c.displayName)}
                      </td>
                      {subjects.map((s) => {
                        const quota = g.gradeId ? quotaOf.get(`${s.id}|${g.gradeId}`) ?? 0 : 0;
                        const tids = byCell.get(`${s.id}|${c.id}`) ?? [];
                        const { options } = optionsOf(s.name);
                        // معلم مسند خارج القائمة المعروضة (موقوف) يُضاف حتى لا تضيع قيمته
                        if (tids[0] && !options.some((o) => o.id === tids[0])) {
                          const t = teachers.find((x) => x.id === tids[0]);
                          if (t) options.unshift({ id: t.id, name: t.name, specialist: false });
                        }
                        return (
                          <td key={s.id} className="border-e border-slate-100 p-0 text-center align-middle last:border-e-0">
                            <AssignCell
                              classId={c.id}
                              subjectId={s.id}
                              teacherId={tids[0] ?? null}
                              extra={Math.max(0, tids.length - 1)}
                              quota={quota}
                              options={options}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

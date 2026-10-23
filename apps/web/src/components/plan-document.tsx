import type { PublishedPlanSubject } from "@app/core";

export interface PlanDocumentProps {
  schoolName: string;
  className: string;
  weekRange: string;
  schoolYear?: string;
  /** أيام المدرسة: {weekday, name} مرتّبة */
  weekDays: { weekday: number; name: string }[];
  subjects: PublishedPlanSubject[];
  compact?: boolean;
}

/**
 * قالب «الخطة الأسبوعية» الموحّد — ترويسة الصف ثم جدول كل مادة باسم معلمها.
 * HTML/CSS طباعة-محض — يُستخدم لصفحة العرض والطباعة ومرجعاً للـPDF.
 */
export function PlanDocument({
  schoolName, className, weekRange, schoolYear, weekDays, subjects, compact,
}: PlanDocumentProps) {
  const pad = compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs";
  return (
    <div dir="rtl" className="mx-auto w-full max-w-4xl bg-white text-slate-900">
      {/* الترويسة */}
      <div className="mb-4 text-center">
        <div className="mx-auto mb-2 h-10 w-16 rounded bg-gradient-to-br from-brand-500 to-brand-700" />
        <p className="text-sm font-medium text-slate-500">{schoolName}</p>
        {schoolYear && <p className="text-xs text-slate-400">{schoolYear}</p>}
        <h1 className="mt-2 text-xl font-bold">الخطة الأسبوعية للصف {className}</h1>
        <p className="mt-1 inline-block rounded-lg bg-brand-50 px-6 py-1 text-sm font-semibold text-brand-700">
          {weekRange}
        </p>
      </div>

      {/* جدول لكل مادة */}
      {subjects.map((s) => (
        <section key={s.subjectId} className="mb-6 break-inside-avoid">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-brand-600 px-4 py-2 text-white">
            <h2 className="text-sm font-bold">مادة {s.subjectName}</h2>
            <span className="text-xs font-medium">
              المعلم: {s.teacherName}
              {s.missing && <em className="ms-2 rounded bg-amber-400/90 px-2 py-0.5 not-italic text-amber-950">لم تُسلَّم</em>}
            </span>
          </div>
          <table className="w-full border-collapse border border-slate-300">
            <thead>
              <tr className="bg-brand-50">
                {["الأيام", "عنوان الدرس", "الكتاب المدرسي", "منصة ألف والبوابة الذكية", "الاختبارات", "ملاحظات"].map((h) => (
                  <th key={h} className={`border border-slate-300 text-start font-bold text-brand-800 ${pad}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDays.map(({ weekday, name }) => {
                const e = s.entries.find((x) => x.weekday === weekday);
                return (
                  <tr key={weekday} className="align-top">
                    <td className={`border border-slate-300 font-semibold text-slate-700 ${pad}`}>{name}</td>
                    <td className={`border border-slate-300 ${pad}`}>{e?.lessonTitle}</td>
                    <td className={`border border-slate-300 ${pad}`}>{e?.textbook}</td>
                    <td className={`border border-slate-300 ${pad}`}>{e?.platforms}</td>
                    <td className={`border border-slate-300 ${pad}`}>{e?.tests}</td>
                    <td className={`border border-slate-300 ${pad}`}>{e?.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

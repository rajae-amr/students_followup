import type { StudentReportContent } from "@app/core";
import { prisma } from "@app/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

const KIND_AR: Record<string, string> = {
  quiz: "اختبار قصير",
  homework: "واجب",
  exam: "اختبار",
  participation: "مشاركة",
};
const LETTER_TONE: Record<string, "emerald" | "brand" | "amber" | "red"> = {
  A: "emerald", B: "brand", C: "amber", D: "amber", F: "red",
};

/** جسم تقرير الطالب الموحّد — مشترك بين بوابة ولي الأمر وعرض الإدارة */
export async function ReportBody({ r }: { r: StudentReportContent }) {
  const settings = await prisma.schoolSettings.findUnique({
    where: { id: "school" },
    select: { schoolName: true },
  });
  const school = settings?.schoolName ?? "المدرسة";
  const issuedAt = new Date().toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      {/* ترويسة الوثيقة — للطباعة فقط */}
      <div className="mb-4 hidden print:block">
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
          <div>
            <p className="text-lg font-bold text-slate-900">{school}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              تقرير متابعة الطالب — {r.student.name}
              {r.student.className ? ` · ${r.student.className}` : ""}
            </p>
            <p className="text-xs text-slate-500" dir="ltr">
              {r.range.start} ← {r.range.end}
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt={school} className="h-14 w-14" />
        </div>
      </div>

      {/* الحضور */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.attendance className="h-5 w-5 text-brand-600" />
          الحضور — {r.attendance.daysRecorded} يوماً مرصوداً
        </h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">حضور: {r.attendance.present}</span>
          <span className="rounded-lg bg-red-50 px-3 py-1.5 font-medium text-red-700">غياب: {r.attendance.absent}</span>
          <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-amber-700">استئذان: {r.attendance.excused}</span>
          <span className="rounded-lg bg-violet-50 px-3 py-1.5 font-medium text-violet-700">تأخير: {r.attendance.late}</span>
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-600">غياب جزئي: {r.attendance.partial}</span>
        </div>
        {r.attendance.lessonEntries.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
            {r.attendance.lessonEntries.map((e, i) => (
              <li key={i} className="text-xs text-slate-600">
                {e.date} — حصة {e.period} ({e.subject}): {e.statusAr}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* الدرجات */}
      {r.grades.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.grades className="h-5 w-5 text-accent-600" />
            الدرجات
          </h2>
          <div className="space-y-3">
            {r.grades.map((g) => (
              <div key={g.subject + g.teacher}>
                <p className="text-sm font-bold text-slate-700">
                  {g.subject} <span className="text-xs font-normal text-slate-400">— {g.teacher}</span>
                </p>
                <ul className="mt-1 text-sm text-slate-600">
                  {g.assessments.map((a, i) => (
                    <li key={i} className="flex justify-between border-b border-slate-50 py-1.5 last:border-0">
                      <span>
                        {a.title}
                        <span className="mr-1 text-xs text-slate-400">({KIND_AR[a.kind] ?? a.kind} — {a.date})</span>
                      </span>
                      <b>{a.status !== "normal"
                        ? { absent: "غائب", excused: "غائب بعذر", exempt: "معفى" }[a.status] ?? "—"
                        : a.score ?? "—"}
                        {a.status === "normal" && <span className="text-xs font-normal text-slate-400">/{a.max}</span>}
                      </b>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* التقييمات */}
      {r.evaluations.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.evaluation className="h-5 w-5 text-violet-600" />
            التقييمات الأسبوعية
          </h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {r.evaluations.map((e, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-600">
                  {e.category}
                  <span className="mr-1 text-xs text-slate-400">({e.subject})</span>
                </span>
                <Badge tone={LETTER_TONE[e.value] ?? "slate"}>{e.value}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* السلوك */}
      {r.behavior.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.behavior className="h-5 w-5 text-emerald-600" />
            السلوك والملاحظات
          </h2>
          <ul className="divide-y divide-slate-100">
            {r.behavior.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="text-xs text-slate-400">{b.date} — {b.teacher}</span>
                {b.category && <Badge tone="brand">{b.category}</Badge>}
                {b.text && <span className="text-slate-600">{b.text}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* تذييل التوقيع — للطباعة فقط */}
      <div className="mt-8 hidden items-end justify-between text-xs text-slate-500 print:flex">
        <p>تاريخ الإصدار: {issuedAt}</p>
        <p>توقيع الإدارة: ــــــــــــــــــــــــــ</p>
      </div>
    </>
  );
}

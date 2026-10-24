import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormWithResult } from "@/components/form-result";
import {
  publishTimetableAction,
  archiveTimetableAction,
  deleteDraftTimetableAction,
} from "@/server/actions/timetable";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

type Stats = {
  violations?: { severity?: string; message?: string; count?: number }[];
  validationViolations?: { severity?: string; message?: string }[];
  solveTimeMs?: number;
  placed?: number;
  total?: number;
};

export default async function TimetableDraft({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  await requirePerm("timetable");
  const { id } = await params;
  const { class: classId } = await searchParams;

  const [tt, settings] = await Promise.all([
    prisma.generatedTimetable.findUnique({
      where: { id },
      include: {
        entries: {
          include: {
            assignment: { include: { class: true, subject: true, } },
          },
        },
      },
    }),
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
  ]);
  if (!tt) notFound();
  const stats = (tt.statsJson ? JSON.parse(tt.statsJson) : {}) as Stats;
  const weekDays = (settings?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort((a, b) => a - b);

  const teacherIds = [...new Set(tt.entries.map((e) => e.assignment.teacherId))];
  const teacherUsers = await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } });
  const teacherNames = new Map(teacherUsers.map((u) => [u.id, u.name]));

  const classes = [...new Map(tt.entries.map((e) => [e.assignment.classId, e.assignment.class])).values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
  const viewClass = classes.find((c) => c.id === classId) ?? classes[0];

  // تعريفات الفترات لتحديد الصفوف المرئية (فهارس الخانات — قد تتخطى الاستراحات)
  const dayDefs = await prisma.dayPeriodDef.findMany({ orderBy: { index: "asc" } });
  const defAt = new Map(dayDefs.map((d) => [`${d.dayOfWeek}-${d.index}`, d]));
  const periodIndexes = weekDays.map((d) =>
    dayDefs.filter((x) => x.dayOfWeek === d).map((x) => x.index));
  const maxRows = Math.max(...periodIndexes.map((p) => p.length), 0);

  const shown = tt.entries.filter((e) => !viewClass || e.assignment.classId === viewClass.id);
  const entryAt = new Map(shown.map((e) => [`${e.dayOfWeek}-${e.periodIndex}`, e]));

  const statusLabel = tt.status === "PUBLISHED" ? "منشور" : tt.status === "DRAFT" ? "مسودة" : "مؤرشف";
  const warnings = [...(stats.violations ?? []), ...(stats.validationViolations ?? [])];

  const input =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={tt.name}
        subtitle={`${tt.entries.length} خانة${stats.total ? ` — موزّع ${stats.placed}/${stats.total}` : ""}${stats.solveTimeMs ? ` — حُل في ${(stats.solveTimeMs / 1000).toFixed(1)}ث` : ""}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={tt.status === "PUBLISHED" ? "brand" : tt.status === "DRAFT" ? "amber" : "slate"}>{statusLabel}</Badge>
        {tt.status === "DRAFT" && (
          <>
            <FormWithResult action={publishTimetableAction} submitLabel="📤 نشر هذا الجدول (سريان فوري)" bare
              buttonClass="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
              <input type="hidden" name="id" value={tt.id} />
            </FormWithResult>
            <FormWithResult action={deleteDraftTimetableAction} submitLabel="حذف المسودة" bare
              buttonClass="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100">
              <input type="hidden" name="id" value={tt.id} />
            </FormWithResult>
          </>
        )}
        {tt.status === "PUBLISHED" && (
          <FormWithResult action={archiveTimetableAction} submitLabel="أرشفة" bare
            buttonClass="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
            <input type="hidden" name="id" value={tt.id} />
          </FormWithResult>
        )}
        <Link href="/admin/timetable" className="text-xs font-bold text-brand-600 hover:underline">← رجوع للجدولة</Link>
      </div>

      {warnings.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50">
          <h2 className="mb-2 font-bold text-amber-800">ملاحظات المحرك ({warnings.length})</h2>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-amber-700" dir="auto">
            {warnings.slice(0, 50).map((v, i) => (
              <li key={i}>• {v.severity === "error" ? "⛔" : "⚠"} {v.message}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-slate-800">معاينة الشبكة</h2>
          <form method="get" className="flex items-center gap-2">
            <select name="class" defaultValue={viewClass?.id ?? ""} className={input}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </select>
            <button type="submit" className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white">عرض</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th className="rounded-lg bg-slate-100 px-2 py-1.5 font-bold text-slate-600">اليوم</th>
                {Array.from({ length: maxRows }).map((_, i) => (
                  <th key={i} className="rounded-lg bg-slate-100 px-2 py-1.5 font-bold text-slate-600">خ{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDays.map((day, di) => (
                <tr key={day}>
                  <td className="rounded-lg bg-brand-50 px-2 py-1.5 font-bold text-brand-700">{WEEKDAYS[day]}</td>
                  {(periodIndexes[di] ?? []).map((pIdx) => {
                    const def = defAt.get(`${day}-${pIdx}`);
                    if (def?.isBreak) {
                      return <td key={pIdx} className="rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-300">{def.label}</td>;
                    }
                    const e = entryAt.get(`${day}-${pIdx}`);
                    return (
                      <td key={pIdx} className={`min-w-24 rounded-lg px-2 py-1.5 ${e ? "bg-white ring-1 ring-slate-200" : "bg-slate-50/50"}`}>
                        {e && (
                          <>
                            <p className="font-semibold text-slate-800">{e.assignment.subject.name}</p>
                            <p className="text-[10px] text-slate-400">{teacherNames.get(e.assignment.teacherId) ?? ""}</p>
                          </>
                        )}
                      </td>
                    );
                  })}
                  {Array.from({ length: maxRows - (periodIndexes[di]?.length ?? 0) }).map((_, i) => (
                    <td key={`e${i}`} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

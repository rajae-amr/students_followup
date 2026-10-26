import Link from "next/link";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { validatePublishedTimetable } from "@app/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormWithResult } from "@/components/form-result";
import { GenerateButton } from "@/components/generate-button";
import {
  publishTimetableAction,
  archiveTimetableAction,
  deleteDraftTimetableAction,
} from "@/server/actions/timetable";
import { addTimetableSlot, deleteTimetableSlot } from "@/server/actions/admin";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const STATUS_TONE: Record<string, "brand" | "amber" | "slate"> = {
  PUBLISHED: "brand", DRAFT: "amber", ARCHIVED: "slate",
};
const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "منشور", DRAFT: "مسودة", ARCHIVED: "مؤرشف",
};

export default async function TimetableAdmin({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; teacher?: string }>;
}) {
  await requirePerm("timetable");
  const { class: classId, teacher: teacherId } = await searchParams;

  const [settings, classes, teachers, timetables, lastJob] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    prisma.classGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "teacher", isActive: true }, orderBy: { name: "asc" } }),
    prisma.generatedTimetable.findMany({
      orderBy: { createdAt: "desc" }, take: 10,
      include: { _count: { select: { entries: true } } },
    }),
    prisma.timetableJob.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);
  const weekDays = (settings?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort((a, b) => a - b);

  // عرض الجدول المنشور — حسب صف أو معلم
  const viewClass = classes.find((c) => c.id === classId) ?? classes[0];
  const viewTeacher = teachers.find((t) => t.id === teacherId);
  const slots = await prisma.timetableSlot.findMany({
    where: {
      effectiveTo: null,
      ...(viewTeacher ? { teacherId: viewTeacher.id } : viewClass ? { classId: viewClass.id } : {}),
    },
    include: { class: true, subject: true, },
  });
  const teacherNames = new Map(teachers.map((t) => [t.id, t.name]));
  const maxPeriod = slots.reduce((m, s) => Math.max(m, s.period), 0);
  const slotAt = new Map(slots.map((s) => [`${s.weekday}-${s.period}`, s]));

  // الخانات اليدوية = بلا assignmentId — تعديلات استثنائية فوق الجدول المولّد
  const manualSlots = await prisma.timetableSlot.findMany({
    where: { effectiveTo: null, assignmentId: null },
    include: { class: true, subject: true },
    orderBy: [{ weekday: "asc" }, { period: "asc" }],
  });
  const subjects = await prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });

  // فحص مستقل للجدول الساري — نفس متحقق المسودات على الخانات المنشورة
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const check = year ? await validatePublishedTimetable(year.id) : null;
  const hardV = check?.violations.filter((v) => v.severity === "error") ?? [];
  const softV = check?.violations.filter((v) => v.severity === "warning") ?? [];

  const input =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="الجدولة الآلية"
        subtitle="توليد ومراجعة ونشر الجدول الأسبوعي بمحرك القيود"
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold text-slate-800">توليد جدول</h2>
          <p className="mb-3 text-xs text-slate-500">
            يبني المحرك جدولاً كاملاً من التكليفات والكوتا والقيود — النتيجة مسودة لا تُنشر إلا بقرارك.
          </p>
          <GenerateButton />
          {lastJob && (
            <p className="mt-3 text-xs text-slate-400">
              آخر مهمة: {lastJob.status} — {lastJob.createdAt.toLocaleDateString("ar")}
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">الجداول المولّدة</h2>
            <Link href="/admin/timetable/setup" className="text-xs font-bold text-brand-600 hover:underline">
              إعدادات الجدولة ←
            </Link>
          </div>
          {timetables.length === 0 ? (
            <EmptyState icon="schedule" title="لا جداول مولّدة" hint="ولّد أول جدول من البطاقة المجاورة" />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {timetables.map((tt) => {
                const stats = tt.statsJson ? JSON.parse(tt.statsJson) as { placed?: number; total?: number } : null;
                return (
                  <li key={tt.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/timetable/${tt.id}`} className="font-semibold text-slate-800 hover:text-brand-600">
                        {tt.name}
                      </Link>
                      <p className="text-xs text-slate-400">
                        {tt._count.entries} خانة
                        {stats?.total ? ` (${stats.placed}/${stats.total})` : ""}
                        {" — "}{tt.createdAt.toLocaleDateString("ar")}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[tt.status] ?? "slate"}>{STATUS_LABEL[tt.status] ?? tt.status}</Badge>
                    {tt.status === "DRAFT" && (
                      <>
                        <FormWithResult action={publishTimetableAction} submitLabel="نشر" bare
                          buttonClass="text-xs font-bold text-brand-600 hover:text-brand-700">
                          <input type="hidden" name="id" value={tt.id} />
                        </FormWithResult>
                        <FormWithResult action={deleteDraftTimetableAction} submitLabel="حذف" bare
                          buttonClass="text-xs font-semibold text-red-500 hover:text-red-600">
                          <input type="hidden" name="id" value={tt.id} />
                        </FormWithResult>
                      </>
                    )}
                    {tt.status === "PUBLISHED" && (
                      <FormWithResult action={archiveTimetableAction} submitLabel="أرشفة" bare
                        buttonClass="text-xs font-semibold text-slate-400 hover:text-slate-600">
                        <input type="hidden" name="id" value={tt.id} />
                      </FormWithResult>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-slate-800">الجدول الساري</h2>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <select name="class" defaultValue={viewClass?.id ?? ""} className={input}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </select>
            <select name="teacher" defaultValue="" className={input}>
              <option value="">— أو حسب المعلم —</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="submit" className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white">عرض</button>
          </form>
        </div>
        {slots.length === 0 ? (
          <EmptyState icon="schedule" title="لا خانات سارية" hint="انشر مسودة أو أدخل حصصاً يدوياً من «الجدول»" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-center text-xs">
              <thead>
                <tr>
                  <th className="rounded-lg bg-slate-100 px-2 py-1.5 font-bold text-slate-600">اليوم</th>
                  {Array.from({ length: maxPeriod }).map((_, i) => (
                    <th key={i} className="rounded-lg bg-slate-100 px-2 py-1.5 font-bold text-slate-600">ح{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekDays.map((day) => (
                  <tr key={day}>
                    <td className="rounded-lg bg-brand-50 px-2 py-1.5 font-bold text-brand-700">{WEEKDAYS[day]}</td>
                    {Array.from({ length: maxPeriod }).map((_, i) => {
                      const s = slotAt.get(`${day}-${i + 1}`);
                      return (
                        <td key={i} className={`min-w-24 rounded-lg px-2 py-1.5 ${s ? "bg-white ring-1 ring-slate-200" : "bg-slate-50/50"}`}>
                          {s && (
                            <>
                              <p className="font-semibold text-slate-800">{s.subject.name}</p>
                              <p className="text-[10px] text-slate-400">
                                {viewTeacher ? s.class.displayName : (teacherNames.get(s.teacherId) ?? "")}
                              </p>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* فحص تعارضات الجدول الساري — متحقق مستقل عن المحرك */}
      {check && check.slotCount > 0 && (
        <Card className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold text-slate-800">
              فحص التعارضات
              <Badge tone={hardV.length ? "amber" : "brand"}>
                {hardV.length ? `${hardV.length} أساسية` : "سليم"}
              </Badge>
              {softV.length > 0 && <Badge tone="slate">{softV.length} ملاحظة تفضيلية</Badge>}
            </h2>
            <p className="text-xs text-slate-400">{check.slotCount} خانة سارية · المطلوب من التكليفات {check.expected}</p>
          </div>
          {hardV.length === 0 && softV.length === 0 ? (
            <p className="text-sm text-emerald-700">✓ لا تعارضات ولا ملاحظات — الجدول متسق مع كل القيود.</p>
          ) : (
            <details open={hardV.length > 0} className="text-sm">
              <summary className="cursor-pointer text-xs font-bold text-slate-500">عرض التفاصيل ({check.violations.length})</summary>
              <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                {check.violations.map((v, i) => (
                  <li key={i} className={`rounded-lg px-3 py-2 text-xs ${
                    v.severity === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    {v.severity === "error" ? "⛔ " : "⚠ "}{v.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="mb-1 font-bold text-slate-800">تعديلات يدوية</h2>
        <p className="mb-3 text-xs text-slate-500">
          خانات استثنائية فوق الجدول المولّد (استبدال/حصة إضافية) — تُحذف تلقائياً عند نشر جدول جديد.
        </p>
        <FormWithResult action={addTimetableSlot} submitLabel="إضافة خانة" className="mb-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <select name="teacherId" required className={input}>
              <option value="">المعلم…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select name="classId" required className={input}>
              <option value="">الصف…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </select>
            <select name="subjectId" required className={input}>
              <option value="">المادة…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select name="weekday" required className={input}>
              <option value="">اليوم…</option>
              {weekDays.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
            </select>
            <input name="period" type="number" min="1" max="10" placeholder="الحصة" required className={input} />
          </div>
        </FormWithResult>
        {manualSlots.length > 0 ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {manualSlots.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <Badge tone="amber">يدوي</Badge>
                <span className="font-medium text-slate-700">{teacherNames.get(s.teacherId) ?? "—"}</span>
                <span className="text-slate-500">{s.class.displayName} — {s.subject.name}</span>
                <span className="text-slate-400">{WEEKDAYS[s.weekday]} ح{s.period}</span>
                <span className="flex-1" />
                <FormWithResult action={deleteTimetableSlot} submitLabel="حذف" bare
                  buttonClass="text-xs font-semibold text-red-500 hover:text-red-600">
                  <input type="hidden" name="id" value={s.id} />
                </FormWithResult>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">لا تعديلات يدوية حالياً — كل الخانات من الجدول المولّد.</p>
        )}
      </Card>
    </div>
  );
}

export const metadata = { title: "الجدولة" };


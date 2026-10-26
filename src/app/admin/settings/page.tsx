import { prisma } from "@app/db";
import { requireRole } from "@/server/session";
import {
  updateSettings, addTerm, deleteTerm, setCalendarDay, clearCalendarDay,
  addAcademicYear, updateAcademicYear, setCurrentAcademicYear, deleteAcademicYear,
} from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
const lbl = "block text-sm font-medium text-slate-600";

export default async function SettingsPage() {
  await requireRole("admin");
  const [settings, year, allYears, terms, calendarDays] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    prisma.term.findMany({
      where: { academicYear: { isCurrent: true } },
      orderBy: { startDate: "asc" },
    }),
    prisma.calendarDay.findMany({
      orderBy: { date: "asc" },
      take: 60,
      where: { date: { gte: new Date(Date.now() - 30 * 86400_000) } },
    }),
  ]);

  const configured = terms.length > 0 || calendarDays.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="إعدادات المدرسة والتقويم" subtitle="الهوية والعتبات والفصول وأيام الدوام" />

      {!configured && (
        <p className="mb-4 flex items-start gap-2.5 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          <Icon.warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          التقويم غير مهيأ بعد — الإرسال الآلي للتقارير يبقى معطلاً حتى ضبط الفصول أو أيام التقويم.
        </p>
      )}

      <div className="space-y-4">
        {/* الأعوام الدراسية */}
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
            <Icon.schedule className="h-5 w-5 text-violet-600" />
            الأعوام الدراسية
            <Badge tone="violet">{allYears.length}</Badge>
          </h2>
          <ul className="mb-4 divide-y divide-slate-100">
            {allYears.map((y) => (
              <li key={y.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold text-slate-800">{y.name}</span>
                  <span className="text-xs text-slate-400" dir="ltr">
                    {y.startDate.toISOString().slice(0, 10)} — {y.endDate.toISOString().slice(0, 10)}
                  </span>
                  {y.isCurrent ? (
                    <Badge tone="emerald">العام الحالي</Badge>
                  ) : (
                    <FormWithResult
                      action={setCurrentAcademicYear} submitLabel="تفعيل كحالي" bare
                      buttonClass="text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      <input type="hidden" name="id" value={y.id} />
                    </FormWithResult>
                  )}
                  <FormWithResult
                    action={deleteAcademicYear} submitLabel="حذف" bare
                    buttonClass="text-xs font-semibold text-red-400 hover:text-red-600"
                  >
                    <input type="hidden" name="id" value={y.id} />
                  </FormWithResult>
                </div>
                <details className="mt-1">
                  <summary className="w-fit cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-700">
                    تعديل البيانات
                  </summary>
                  <FormWithResult
                    action={updateAcademicYear} submitLabel="حفظ"
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="id" value={y.id} />
                    <label className="text-xs font-medium text-slate-500">الاسم
                      <input name="name" required defaultValue={y.name} className={`${input} mt-1 block`} />
                    </label>
                    <label className="text-xs font-medium text-slate-500">من
                      <input name="startDate" type="date" required defaultValue={y.startDate.toISOString().slice(0, 10)} className={`${input} mt-1 block`} />
                    </label>
                    <label className="text-xs font-medium text-slate-500">إلى
                      <input name="endDate" type="date" required defaultValue={y.endDate.toISOString().slice(0, 10)} className={`${input} mt-1 block`} />
                    </label>
                  </FormWithResult>
                </details>
              </li>
            ))}
          </ul>
          <FormWithResult action={addAcademicYear} submitLabel="+ عام جديد" className="border-t border-slate-100 pt-4">
            <div className="grid w-full gap-3 sm:grid-cols-4">
              <label className="text-xs font-medium text-slate-500">الاسم — مثال 2027/2028
                <input name="name" required placeholder="2027/2028" dir="ltr" className={`${input} mt-1 block w-full`} />
              </label>
              <label className="text-xs font-medium text-slate-500">من
                <input name="startDate" type="date" required className={`${input} mt-1 block w-full`} />
              </label>
              <label className="text-xs font-medium text-slate-500">إلى
                <input name="endDate" type="date" required className={`${input} mt-1 block w-full`} />
              </label>
              <label className="flex cursor-pointer items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                <input type="checkbox" name="isCurrent" className="h-4 w-4 accent-brand-600" />
                عام حالي فوراً
              </label>
            </div>
          </FormWithResult>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            كل العمليات (إسنادات، تسجيلات، جدولة) تُربط بالعام «الحالي» — غيّره فقط عند بداية عام جديد.
          </p>
        </Card>

        {/* الإعدادات العامة */}
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
            <Icon.settings className="h-5 w-5 text-brand-600" />
            عام
          </h2>
          <FormWithResult action={updateSettings} submitLabel="حفظ الإعدادات" className="grid gap-4">
            <div className="grid w-full gap-4 sm:grid-cols-2">
            <label className={lbl}>اسم المدرسة
              <input name="schoolName" required defaultValue={settings?.schoolName ?? ""} className={`${input} mt-1 w-full`} />
            </label>
            <label className={lbl}>عدد الحصص اليومية
              <input name="periodsPerDay" type="number" min={1} max={12} required
                     defaultValue={settings?.periodsPerDay ?? 8} className={`${input} mt-1 w-full`} />
            </label>
            <label className={lbl}>عتبة «غياب يوم» (حصص)
              <input name="absentFullDayThreshold" type="number" min={1} required
                     defaultValue={settings?.absentFullDayThreshold ?? 3} className={`${input} mt-1 w-full`} />
            </label>
            <label className={lbl}>عتبة «غائب بعذر» (حصص)
              <input name="excusedFullDayThreshold" type="number" min={1} required
                     defaultValue={settings?.excusedFullDayThreshold ?? 3} className={`${input} mt-1 w-full`} />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium text-slate-600">أيام الدوام</legend>
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((d, i) => {
                  const on = settings?.weekDays.includes(i) ?? i <= 4;
                  return (
                    <label
                      key={d}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
                    >
                      <input type="checkbox" name="weekDays" value={i} defaultChecked={on}
                             className="h-4 w-4 accent-brand-600" />
                      {d}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50 sm:col-span-2">
              <input
                type="checkbox" name="autoAbsenceAlert"
                defaultChecked={settings?.autoAbsenceAlert ?? false}
                className="h-4 w-4 accent-brand-600"
              />
              إشعار أولياء الأمور آلياً عند اكتمال حالة الغياب
              <span className="text-xs font-normal text-slate-400">
                (تيليجرام للمرتبطين، البوابة لغيرهم — مرة واحدة لكل طالب/يوم)
              </span>
            </label>
            <span className="text-xs text-slate-400 sm:col-span-2">
              إصدار السياسة: {settings?.policyVersion ?? 1} — تغيير العتبات يرفعه ويطبّق على السجلات الجديدة فقط.
            </span>
            </div>
          </FormWithResult>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* الفصول الدراسية */}
          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
              <Icon.schedule className="h-5 w-5 text-accent-600" />
              فصول {year?.name ?? "العام الحالي"}
            </h2>
            <FormWithResult action={addTerm} submitLabel="إضافة" className="mb-4">
              <label className="text-xs font-medium text-slate-500">اسم الفصل
                <input name="name" required placeholder="الفصل الأول" className={`${input} mt-1 block w-full`} />
              </label>
              <label className="text-xs font-medium text-slate-500">من
                <input name="startDate" type="date" required className={`${input} mt-1 block`} />
              </label>
              <label className="text-xs font-medium text-slate-500">إلى
                <input name="endDate" type="date" required className={`${input} mt-1 block`} />
              </label>
            </FormWithResult>
            <ul className="divide-y divide-slate-100">
              {terms.map((t: { id: string; name: string; startDate: Date; endDate: Date }) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-slate-800">{t.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400" dir="ltr">
                      {t.startDate.toISOString().slice(0, 10)} — {t.endDate.toISOString().slice(0, 10)}
                    </span>
                    <FormWithResult
                      action={deleteTerm} submitLabel="حذف" bare
                      buttonClass="text-xs font-semibold text-red-500 hover:text-red-600"
                    >
                      <input type="hidden" name="id" value={t.id} />
                    </FormWithResult>
                  </span>
                </li>
              ))}
              {!terms.length && <li className="py-3 text-sm text-slate-400">لا فصول بعد</li>}
            </ul>
          </Card>

          {/* تقويم الأيام */}
          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
              <Icon.clock className="h-5 w-5 text-accent-600" />
              تقويم الأيام (دوام/إجازة)
            </h2>
            <FormWithResult action={setCalendarDay} submitLabel="تسجيل" className="mb-4">
              <label className="text-xs font-medium text-slate-500">التاريخ
                <input name="date" type="date" required className={`${input} mt-1 block`} />
              </label>
              <label className="text-xs font-medium text-slate-500">الحالة
                <select name="isSchoolDay" className={`${input} mt-1 block`}>
                  <option value="false">إجازة</option>
                  <option value="true">يوم دوام استثنائي</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">ملاحظة
                <input name="note" placeholder="اختياري" className={`${input} mt-1 block`} />
              </label>
            </FormWithResult>
            <ul className="divide-y divide-slate-100">
              {calendarDays.map((d: { id: string; date: Date; isSchoolDay: boolean; note: string | null }) => (
                <li key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-slate-700" dir="ltr">{d.date.toISOString().slice(0, 10)}</span>
                  <span className="flex items-center gap-3">
                    <Badge tone={d.isSchoolDay ? "emerald" : "amber"}>
                      {d.isSchoolDay ? "دوام" : "إجازة"}
                    </Badge>
                    {d.note && <span className="text-xs text-slate-400">{d.note}</span>}
                    <FormWithResult
                      action={clearCalendarDay} submitLabel="إزالة" bare
                      buttonClass="text-xs font-semibold text-red-500 hover:text-red-600"
                    >
                      <input type="hidden" name="id" value={d.id} />
                    </FormWithResult>
                  </span>
                </li>
              ))}
              {!calendarDays.length && (
                <li className="py-3 text-sm text-slate-400">
                  لا أيام مسجلة — الأيام خارج أيام الدوام إجازة افتراضياً
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: "الإعدادات" };


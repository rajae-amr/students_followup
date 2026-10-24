import Link from "next/link";
import { Fragment } from "react";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { weekStartOf, DAY_NAMES } from "@app/core";
import {
  copyWeekDutiesAction,
  saveDutyLocationAction,
  toggleDutyLocationAction,
  deleteDutyLocationAction,
} from "@/server/actions/duties";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormWithResult } from "@/components/form-result";
import { DutyCell } from "./duty-cell";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (d: Date) => d.toLocaleDateString("ar", { day: "numeric", month: "long" });

/**
 * جدول الإشراف والمناوبات الأسبوعي — موقع × يوم → معلم مناوب.
 * يُدار أسبوعياً ويُنسخ من الأسبوع السابق ثم يُعدَّل.
 */
export default async function DutiesPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requirePerm("duties");
  const { week: weekParam } = await searchParams;
  const weekStart = weekParam ? weekStartOf(new Date(weekParam)) : weekStartOf(new Date());
  const prevWeek = new Date(weekStart); prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  const nextWeek = new Date(weekStart); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 4);

  const [settings, locations, teachers, duties, allLocations] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    prisma.dutyLocation.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.user.findMany({ where: { role: "teacher", isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.dutyAssignment.findMany({ where: { weekStart }, include: { teacher: { select: { name: true } } } }),
    prisma.dutyLocation.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  const weekDays = (settings?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort();
  const at = new Map(duties.map((d) => [`${d.locationId}|${d.dayOfWeek}`, d] as const));
  const filled = duties.length;
  const cells = locations.length * weekDays.length;

  // تجميع المواقع حسب مجموعتها (دور أرضي/أول/عام) — بترتيب ظهورها
  const groups = [...new Set(locations.map((l) => l.group ?? "مواقع عامة"))];
  const opts = teachers.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="الإشراف والمناوبات"
        subtitle={`أسبوع ${fmt(weekStart)} – ${fmt(weekEnd)} · ${filled} من ${cells} خانة معبّأة`}
      />

      {/* تنقّل الأسابيع + نسخ */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={`/admin/duties?week=${iso(prevWeek)}`}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">
              ← الأسبوع السابق
            </Link>
            <Link href={`/admin/duties?week=${iso(nextWeek)}`}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">
              الأسبوع التالي →
            </Link>
            <Link href="/admin/duties" className="text-xs font-bold text-brand-600 hover:underline">الحالي</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/print/duties?week=${iso(weekStart)}`} target="_blank"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
              🖨 طباعة الكشف
            </Link>
            <FormWithResult action={copyWeekDutiesAction} submitLabel="⧉ نسخ مناوبات الأسبوع الماضي" bare
              buttonClass="rounded-xl bg-accent-50 px-4 py-2 text-sm font-bold text-accent-700 ring-1 ring-accent-200 hover:bg-accent-100">
              <input type="hidden" name="weekStart" value={iso(weekStart)} />
            </FormWithResult>
          </div>
        </div>
      </Card>

      {/* شبكة المناوبات */}
      <Card className="mb-4">
        {locations.length === 0 ? (
          <p className="text-sm text-slate-400">لا مواقع إشراف بعد — أضفها من بطاقة «مواقع الإشراف» أدناه.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="min-w-36 p-2 text-start text-xs font-bold text-slate-500">الموقع</th>
                  {weekDays.map((d) => (
                    <th key={d} className="min-w-32 border-e border-slate-100 p-2 text-center text-xs font-bold text-slate-500 last:border-e-0">
                      {DAY_NAMES[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g}>
                    <tr className="bg-slate-100/60">
                      <td colSpan={weekDays.length + 1} className="px-2 py-1 text-xs font-bold text-slate-500">{g}</td>
                    </tr>
                    {locations.filter((l) => (l.group ?? "مواقع عامة") === g).map((l) => (
                      <tr key={l.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="p-2 text-xs font-bold text-slate-700 whitespace-nowrap">{l.name}</td>
                        {weekDays.map((d) => {
                          const duty = at.get(`${l.id}|${d}`);
                          return (
                            <td key={d} className="border-e border-slate-100 p-0 align-middle last:border-e-0">
                              <DutyCell
                                locationId={l.id}
                                dayOfWeek={d}
                                weekStart={iso(weekStart)}
                                teacherId={duty?.teacherId ?? null}
                                teacherName={duty?.teacher?.name ?? null}
                                label={duty?.label ?? null}
                                options={opts}
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
        )}
      </Card>

      {/* إدارة المواقع */}
      <Card>
        <h2 className="mb-1 font-bold text-slate-800">مواقع الإشراف</h2>
        <p className="mb-3 text-xs text-slate-500">
          المواقع المعروضة في الشبكة. «المجموعة» ترتّبها تحت عناوين (الدور الأرضي / الدور الأول / عام).
        </p>
        <ul className="mb-4 space-y-1.5">
          {allLocations.map((l) => (
            <li key={l.id} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${
              l.isActive ? "bg-slate-50" : "bg-slate-50/60 opacity-60"
            }`}>
              <FormWithResult action={saveDutyLocationAction} submitLabel="حفظ" bare
                className="flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="id" value={l.id} />
                <input name="name" defaultValue={l.name} required className={`${input} w-44 !py-1 text-xs`} />
                <input name="group" defaultValue={l.group ?? ""} placeholder="المجموعة" className={`${input} w-32 !py-1 text-xs`} />
                <input name="sortOrder" type="number" defaultValue={l.sortOrder} title="الترتيب" className={`${input} w-14 !py-1 text-xs`} dir="ltr" />
              </FormWithResult>
              <FormWithResult action={toggleDutyLocationAction} submitLabel={l.isActive ? "تعطيل" : "تفعيل"} bare
                buttonClass={`text-xs font-bold ${l.isActive ? "text-amber-500 hover:text-amber-600" : "text-emerald-600"}`}>
                <input type="hidden" name="id" value={l.id} />
              </FormWithResult>
              {!l.isActive && (
                <FormWithResult action={deleteDutyLocationAction} submitLabel="حذف نهائي" bare
                  buttonClass="text-xs font-bold text-red-400 hover:text-red-600">
                  <input type="hidden" name="id" value={l.id} />
                </FormWithResult>
              )}
              {!l.isActive && <Badge tone="slate">معطّل</Badge>}
            </li>
          ))}
        </ul>
        <FormWithResult action={saveDutyLocationAction} submitLabel="+ إضافة موقع" className="!mt-0">
          <input name="name" placeholder="اسم الموقع (الحافلات / المقصف / الساحة)" required className={input} />
          <input name="group" placeholder="المجموعة" className={`${input} w-36`} />
          <input name="sortOrder" type="number" placeholder="ترتيب" className={`${input} w-20`} dir="ltr" />
        </FormWithResult>
      </Card>
    </div>
  );
}

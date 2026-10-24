import Link from "next/link";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormWithResult } from "@/components/form-result";
import { SlotGridEditor, type GridDay } from "@/components/slot-grid-editor";
import {
  setQuotaAction,
  addDayPeriodDefAction,
  updateDayPeriodDefAction,
  deleteDayPeriodDefAction,
  copyDayPeriodsToAllAction,
  saveWeekDaysAction,
  saveConstraintsAction,
  applyConstraintPresetAction,
  saveTeacherUnavailAction,
  saveTeacherLimitsAction,
  saveSubjectBlocksAction,
  saveSubjectRulesAction,
  addGradeAction,
  updateGradeAction,
  deleteGradeAction,
  addClassAction,
  renameClassAction,
  toggleClassAction,
  deleteClassAction,
} from "@/server/actions/timetable";
import {
  mergeConstraints,
  CONSTRAINT_LABELS,
  CONSTRAINT_PRESETS,
  ESSENTIAL_KINDS,
  type ConstraintKind,
} from "@app/core";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export default async function TimetableSetup({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string; subject?: string }>;
}) {
  await requirePerm("timetable");
  const { teacher: teacherId, subject: subjectId } = await searchParams;

  const [settings, grades, subjects, quotas, dayDefs, teachers, subjectBlocks, teacherBlocks] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    prisma.gradeLevel.findMany({
      orderBy: { order: "asc" },
      include: { classes: { orderBy: { name: "asc" } } },
    }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.subjectGradeQuota.findMany({ include: { subject: true, grade: true }, orderBy: [{ grade: { order: "asc" } }] }),
    prisma.dayPeriodDef.findMany({ orderBy: [{ dayOfWeek: "asc" }, { index: "asc" }] }),
    prisma.user.findMany({
      where: { role: "teacher", isActive: true },
      include: { teacherProfile: true },
      orderBy: { name: "asc" },
    }),
    prisma.subjectUnavailability.findMany(),
    prisma.teacherAvailability.findMany(),
  ]);
  const constraints = mergeConstraints(settings?.constraintsJson);
  const weekDays = (settings?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort((a, b) => a - b);
  const gridDays: GridDay[] = weekDays.map((d) => ({
    dayOfWeek: d,
    name: WEEKDAYS[d] ?? `يوم ${d}`,
    defs: dayDefs.filter((x) => x.dayOfWeek === d).map((x) => ({ index: x.index, label: x.label, isBreak: x.isBreak })),
  }));

  const selTeacher = teachers.find((t) => t.id === teacherId) ?? teachers[0];
  const selSubject = subjects.find((s) => s.id === subjectId) ?? subjects[0];
  const teacherKeys = teacherBlocks.filter((b) => b.teacherId === selTeacher?.id)
    .map((b) => `${b.dayOfWeek}-${b.periodIndex}`);
  const subjectKeys = subjectBlocks.filter((b) => b.subjectId === selSubject?.id)
    .map((b) => `${b.dayOfWeek}-${b.periodIndex}`);

  const quotaOf = new Map(quotas.map((q) => [`${q.subjectId}|${q.gradeId}`, q.weeklyPeriods]));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="إعدادات الجدولة" subtitle="الكوتا والفترات والقيود وتوفر المعلمين" />
      <Link href="/admin/timetable" className="inline-block text-xs font-bold text-brand-600 hover:underline">
        ← رجوع للجدولة
      </Link>

      {/* ===== أيام الدوام ===== */}
      <Card>
        <h2 className="mb-1 font-bold text-slate-800">أيام الدوام</h2>
        <p className="mb-3 text-xs text-slate-500">الأيام التي تظهر في شبكات الجدولة وكشوف الحضور.</p>
        <FormWithResult action={saveWeekDaysAction} submitLabel="حفظ الأيام">
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <label key={d} className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold ${
                weekDays.includes(d) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-400"
              }`}>
                <input type="checkbox" name={`day${d}`} defaultChecked={weekDays.includes(d)} />
                {WEEKDAYS[d]}
              </label>
            ))}
          </div>
        </FormWithResult>
      </Card>

      {/* ===== المستويات والشعب ===== */}
      <Card>
        <h2 className="mb-1 font-bold text-slate-800">المستويات والشعب</h2>
        <p className="mb-3 text-xs text-slate-500">
          إضافة/تعديل المستويات الصفية وشعبها. التعطيل يخفي الشعبة من المحددات دون فقدان سجلاتها؛ الحذف محميّ بالمراجع.
        </p>
        <div className="space-y-3">
          {grades.map((g) => (
            <div key={g.id} className="rounded-xl border border-slate-100 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <FormWithResult action={updateGradeAction} submitLabel="حفظ" bare className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={g.id} />
                  <input name="name" defaultValue={g.name} required className={`${input} w-40 !py-1 text-xs`} />
                  <input name="order" type="number" defaultValue={g.order} title="الترتيب" className={`${input} w-16 !py-1 text-xs`} dir="ltr" />
                </FormWithResult>
                <Badge tone="slate">{g.classes.filter((c) => c.isActive).length} شعبة نشطة</Badge>
                <FormWithResult action={deleteGradeAction} submitLabel="حذف المستوى" bare
                  buttonClass="text-xs font-semibold text-red-400 hover:text-red-600">
                  <input type="hidden" name="id" value={g.id} />
                </FormWithResult>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {g.classes.map((c) => (
                  <span key={c.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                    c.isActive ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-400 line-through"
                  }`}>
                    {c.displayName}
                    <FormWithResult action={toggleClassAction} submitLabel={c.isActive ? "تعطيل" : "تفعيل"} bare
                      buttonClass="text-[10px] font-bold text-brand-500 hover:text-brand-700">
                      <input type="hidden" name="id" value={c.id} />
                    </FormWithResult>
                    {!c.isActive && (
                      <FormWithResult action={deleteClassAction} submitLabel="حذف" bare
                        buttonClass="text-[10px] font-bold text-red-400 hover:text-red-600">
                        <input type="hidden" name="id" value={c.id} />
                      </FormWithResult>
                    )}
                  </span>
                ))}
                <FormWithResult action={addClassAction} submitLabel="+ شعبة" bare
                  buttonClass="rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-brand-600 hover:bg-brand-100">
                  <input type="hidden" name="gradeId" value={g.id} />
                  <input name="section" type="number" min="1" placeholder="رقم" required
                    className="w-14 rounded-lg border border-slate-200 px-1.5 py-1 text-xs" dir="ltr" />
                </FormWithResult>
              </div>
            </div>
          ))}
          <FormWithResult action={addGradeAction} submitLabel="+ مستوى جديد" className="!mt-0">
            <input name="name" placeholder="اسم المستوى (الصف التاسع)" required className={input} />
            <input name="order" type="number" min="1" placeholder="الترتيب" required className={`${input} w-24`} dir="ltr" />
          </FormWithResult>
        </div>
      </Card>

      {/* ===== كوتا المواد ===== */}
      <Card>
        <h2 className="mb-1 font-bold text-slate-800">نصاب المواد الأسبوعي لكل صف</h2>
        <p className="mb-3 text-xs text-slate-500">عدد الحصص الأسبوعية للمادة في كل مستوى صفي — يوزّعها المحرك على شعب الصف.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-2 text-start font-semibold">المادة</th>
                {grades.map((g) => <th key={g.id} className="text-center font-semibold">{g.name.replace("الصف ", "")}</th>)}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 font-medium text-slate-700">{s.name}</td>
                  {grades.map((g) => (
                    <td key={g.id} className="text-center">
                      <QuotaCell subjectId={s.id} gradeId={g.id} value={quotaOf.get(`${s.id}|${g.id}`) ?? 0} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ===== تعريفات الفترات ===== */}
      <Card>
        <h2 className="mb-1 font-bold text-slate-800">فترات اليوم الدراسي</h2>
        <p className="mb-3 text-xs text-slate-500">خانات كل يوم بالترتيب — الحصص والاستراحات. الفهرس يحدد موضع الخانة في اليوم.</p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {weekDays.map((day) => (
            <div key={day} className="rounded-xl border border-slate-100 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">{WEEKDAYS[day]}</h3>
                <FormWithResult action={copyDayPeriodsToAllAction} submitLabel="نسخ للكل" bare
                  buttonClass="text-[11px] font-bold text-brand-600 hover:text-brand-700">
                  <input type="hidden" name="dayOfWeek" value={day} />
                </FormWithResult>
              </div>
              <ul className="space-y-1">
                {dayDefs.filter((d) => d.dayOfWeek === day).map((d) => (
                  <li key={d.id} className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`text-xs font-bold ${d.isBreak ? "text-slate-400" : "text-slate-600"}`}>
                        {d.index}. {d.isBreak ? "استراحة" : "حصة"}
                      </span>
                      <FormWithResult action={deleteDayPeriodDefAction} submitLabel="×" bare
                        buttonClass="text-red-400 hover:text-red-600">
                        <input type="hidden" name="id" value={d.id} />
                      </FormWithResult>
                    </div>
                    <FormWithResult action={updateDayPeriodDefAction} submitLabel="✓" bare
                      buttonClass="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600 hover:bg-brand-100"
                      className="flex items-center gap-1">
                      <input type="hidden" name="id" value={d.id} />
                      <input name="label" defaultValue={d.label} required
                        className="w-20 rounded border border-slate-200 px-1 py-0.5 text-[11px]" />
                      <input name="start" type="time" defaultValue={d.start ?? ""} title="البداية"
                        className="w-[4.7rem] rounded border border-slate-200 px-1 py-0.5 text-[11px]" dir="ltr" />
                      <input name="end" type="time" defaultValue={d.end ?? ""} title="النهاية"
                        className="w-[4.7rem] rounded border border-slate-200 px-1 py-0.5 text-[11px]" dir="ltr" />
                      <label className="flex items-center gap-0.5 text-[10px] text-slate-400" title="استراحة">
                        <input type="checkbox" name="isBreak" defaultChecked={d.isBreak} />راحة
                      </label>
                    </FormWithResult>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <FormWithResult action={addDayPeriodDefAction} submitLabel="إضافة خانة">
          <select name="dayOfWeek" required className={input}>
            {weekDays.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
          </select>
          <input name="index" type="number" min="0" placeholder="الفهرس" required className={input} />
          <input name="label" placeholder="التسمية (الحصة 1 / استراحة)" required className={input} />
          <input name="start" type="time" title="البداية" className={input} dir="ltr" />
          <input name="end" type="time" title="النهاية" className={input} dir="ltr" />
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="checkbox" name="isBreak" /> استراحة
          </label>
        </FormWithResult>
      </Card>

      {/* ===== قيود المحرك ===== */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-800">قيود المحرك</h2>
            <p className="text-xs text-slate-500">«صارم» = شرط لا يُكسر · «لين» = تفضيل بوزن · «مطفأ» = يُتجاهل</p>
          </div>
          <div className="flex gap-2">
            {Object.values(CONSTRAINT_PRESETS).map((p) => (
              <FormWithResult key={p.label} action={applyConstraintPresetAction} submitLabel={p.label} bare
                buttonClass="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">
                <input type="hidden" name="json" value={JSON.stringify(p.config)} />
              </FormWithResult>
            ))}
          </div>
        </div>
        <FormWithResult action={saveConstraintsAction} submitLabel="حفظ القيود" className="w-full">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">القيد</th>
                  <th className="text-start font-semibold">الوضع</th>
                  <th className="text-start font-semibold">الوزن</th>
                  <th className="text-start font-semibold">القيمة العامة</th>
                </tr>
              </thead>
              <tbody>
                {([...ESSENTIAL_KINDS, ...(Object.keys(CONSTRAINT_LABELS) as ConstraintKind[]).filter((k) => !ESSENTIAL_KINDS.includes(k))]).map((k) => (
                  <tr key={k} className="border-b border-slate-50 last:border-0">
                    <td className="py-2">
                      <p className="font-medium text-slate-700">{CONSTRAINT_LABELS[k].label}</p>
                      <p className="text-[11px] text-slate-400">{CONSTRAINT_LABELS[k].hint}</p>
                    </td>
                    <td>
                      <select name={`${k}.mode`} defaultValue={constraints[k].mode} className={input}>
                        <option value="off">مطفأ</option>
                        <option value="soft">لين</option>
                        <option value="hard">صارم</option>
                      </select>
                    </td>
                    <td><input name={`${k}.weight`} type="number" min="0" defaultValue={constraints[k].weight} className={`${input} w-20`} /></td>
                    <td>
                      {CONSTRAINT_LABELS[k].hasValue
                        ? <input name={`${k}.value`} type="number" min="0" defaultValue={constraints[k].value ?? 0} className={`${input} w-20`} />
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FormWithResult>
      </Card>

      {/* ===== توفر المعلم وحدوده ===== */}
      <Card>
        <h2 className="mb-3 font-bold text-slate-800">توفر المعلم وحدوده</h2>
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
          <select name="teacher" defaultValue={selTeacher?.id ?? ""} className={input}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="submit" className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white">اختيار</button>
        </form>
        {selTeacher?.teacherProfile && (
          <>
            <FormWithResult action={saveTeacherLimitsAction} submitLabel="حفظ بياناته وحدوده" className="mb-4">
              <input type="hidden" name="teacherId" value={selTeacher.id} />
              <input name="specialization" placeholder="التخصص"
                defaultValue={selTeacher.teacherProfile.specialization ?? ""} className={input} />
              <input name="employeeNo" placeholder="الرقم الوظيفي"
                defaultValue={selTeacher.teacherProfile.employeeNo ?? ""} className={`${input} w-28`} dir="ltr" />
              <input type="color" name="color" title="لون المعلم"
                defaultValue={selTeacher.teacherProfile.color} className="h-9 w-9 cursor-pointer rounded-xl border border-slate-200" />
              <input name="weeklyLessons" type="number" min="1" placeholder="النصاب الأسبوعي"
                defaultValue={selTeacher.teacherProfile.weeklyLessons} className={input} />
              <input name="maxDailyLessons" type="number" min="1" placeholder="أقصى يومي"
                defaultValue={selTeacher.teacherProfile.maxDailyLessons ?? ""} className={input} />
              <input name="maxConsecutive" type="number" min="1" placeholder="أقصى متتالية"
                defaultValue={selTeacher.teacherProfile.maxConsecutive ?? ""} className={input} />
              <input name="maxWorkingDays" type="number" min="1" max="6" placeholder="أقصى أيام"
                defaultValue={selTeacher.teacherProfile.maxWorkingDays ?? ""} className={input} />
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" name="avoidLastPeriod" defaultChecked={selTeacher.teacherProfile.avoidLastPeriod} />
                يتجنب الحصة الأخيرة
              </label>
            </FormWithResult>
            <SlotGridEditor
              days={gridDays}
              initialKeys={teacherKeys}
              entityField="teacherId"
              entityId={selTeacher.id}
              action={saveTeacherUnavailAction}
            />
          </>
        )}
      </Card>

      {/* ===== قواعد المادة وخاناتها المحظورة ===== */}
      <Card>
        <h2 className="mb-3 font-bold text-slate-800">قواعد المادة وخاناتها المحظورة</h2>
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
          <select name="subject" defaultValue={selSubject?.id ?? ""} className={input}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="submit" className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white">اختيار</button>
        </form>
        {selSubject && (
          <>
            <FormWithResult action={saveSubjectRulesAction} submitLabel="حفظ القواعد" className="mb-4">
              <input type="hidden" name="subjectId" value={selSubject.id} />
              <input name="maxPerDay" type="number" min="1" placeholder="أقصى حصص/يوم"
                defaultValue={selSubject.maxPerDay ?? ""} className={input} />
              <input name="minDaysPerWeek" type="number" min="1" max="6" placeholder="أدنى أيام/أسبوع"
                defaultValue={selSubject.minDaysPerWeek ?? ""} className={input} />
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" name="preferEarly" defaultChecked={selSubject.preferEarly} />
                تفضيل الحصص المبكرة
              </label>
            </FormWithResult>
            <SlotGridEditor
              days={gridDays}
              initialKeys={subjectKeys}
              entityField="subjectId"
              entityId={selSubject.id}
              action={saveSubjectBlocksAction}
            />
          </>
        )}
      </Card>
    </div>
  );
}

/** خلية كوتا — حقل عدد صغير يحفظ عند التغيير */
function QuotaCell({ subjectId, gradeId, value }: { subjectId: string; gradeId: string; value: number }) {
  return (
    <FormWithResult action={setQuotaAction} submitLabel="✓" bare
      buttonClass="rounded-lg bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-600 hover:bg-brand-100">
      <span className="inline-flex items-center gap-1">
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="gradeId" value={gradeId} />
        <input name="weeklyPeriods" type="number" min="0" defaultValue={value}
          className="w-12 rounded-lg border border-slate-200 px-1 py-1 text-center text-xs" />
      </span>
    </FormWithResult>
  );
}

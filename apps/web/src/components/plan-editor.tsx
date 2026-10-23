import { savePlanAction } from "@/server/actions/plans";
import { FormWithResult } from "@/components/form-result";

interface PlanEntryRow {
  weekday: number;
  lessonTitle: string | null;
  textbook: string | null;
  platforms: string | null;
  tests: string | null;
  notes: string | null;
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** جدول تحرير الخطة الأسبوعية — مشترك بين صفحة المعلم وتحرير الإدارة */
export function PlanEditor({
  classId,
  subjectId,
  teacherId,
  weekKey,
  weekDays,
  entries,
}: {
  classId: string;
  subjectId: string;
  /** يُمرَّر فقط عند تحرير الإدارة لخطة معلم آخر */
  teacherId?: string;
  weekKey: string;
  weekDays: { weekday: number; name: string }[];
  entries: PlanEntryRow[];
}) {
  const byDay = new Map(entries.map((e) => [e.weekday, e]));
  return (
    <FormWithResult action={savePlanAction} submitLabel="حفظ المسودة" className="!mt-0">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="weekStart" value={weekKey} />
      {teacherId && <input type="hidden" name="teacherId" value={teacherId} />}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="w-24 py-2 text-start font-semibold">اليوم</th>
              <th className="text-start font-semibold">عنوان الدرس</th>
              <th className="text-start font-semibold">الكتاب المدرسي</th>
              <th className="text-start font-semibold">منصة ألف والبوابة الذكية</th>
              <th className="text-start font-semibold">الاختبارات</th>
              <th className="text-start font-semibold">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {weekDays.map(({ weekday, name }) => {
              const e = byDay.get(weekday);
              return (
                <tr key={weekday} className="border-b border-slate-50 align-top">
                  <td className="py-2 pe-2 font-semibold text-slate-700">{name}</td>
                  <td className="p-1"><input name={`t_${weekday}`} defaultValue={e?.lessonTitle ?? ""} className={input} /></td>
                  <td className="p-1"><input name={`b_${weekday}`} defaultValue={e?.textbook ?? ""} className={input} placeholder="…ص" /></td>
                  <td className="p-1"><input name={`p_${weekday}`} defaultValue={e?.platforms ?? ""} className={input} /></td>
                  <td className="p-1"><input name={`q_${weekday}`} defaultValue={e?.tests ?? ""} className={input} /></td>
                  <td className="p-1"><input name={`n_${weekday}`} defaultValue={e?.notes ?? ""} className={input} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </FormWithResult>
  );
}

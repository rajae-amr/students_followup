import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import {
  addSubject,
  addTimetableSlot,
  deleteTimetableSlot,
} from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import type { ClassGroup, Prisma, Subject, User } from "@prisma/client";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export default async function ScheduleAdmin() {
  await requireRole("admin");
  const [teachers, classes, subjects, slots] = await Promise.all([
    prisma.user.findMany({
      where: { role: "teacher", isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.classGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.timetableSlot.findMany({
      include: { class: true, subject: true },
      orderBy: [{ teacherId: "asc" }, { weekday: "asc" }, { period: "asc" }],
    }),
  ]);
  const teacherNames = new Map(teachers.map((t: User) => [t.id, t.name]));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="الجدول والإسنادات" subtitle="المواد الدراسية وحصص المعلمين الأسبوعية" />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">+</span>
            إضافة مادة
          </h2>
          <FormWithResult action={addSubject} submitLabel="إضافة المادة">
            <input name="name" placeholder="اسم المادة" required className={input} />
          </FormWithResult>
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600">+</span>
            إسناد حصة أسبوعية
          </h2>
          <FormWithResult action={addTimetableSlot} submitLabel="إسناد الحصة">
            <div className="grid grid-cols-2 gap-2">
              <select name="teacherId" required className={input}>
                <option value="">المعلم…</option>
                {teachers.map((t: User) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select name="classId" required className={input}>
                <option value="">الصف…</option>
                {classes.map((c: ClassGroup) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
              <select name="subjectId" required className={input}>
                <option value="">المادة…</option>
                {subjects.map((s: Subject) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <select name="weekday" required className={input}>
                  <option value="">اليوم…</option>
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <input name="period" type="number" min="1" max="10" placeholder="الحصة" required className={input} />
              </div>
            </div>
          </FormWithResult>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.schedule className="h-5 w-5 text-brand-600" />
          الحصص المسندة
          <Badge tone="brand">{slots.length}</Badge>
        </h2>
        {slots.length === 0 ? (
          <EmptyState icon="schedule" title="لا حصص مسندة بعد" hint="أسند أول حصة من النموذج أعلاه" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">المعلم</th>
                  <th className="text-start font-semibold">الصف</th>
                  <th className="text-start font-semibold">المادة</th>
                  <th className="text-start font-semibold">اليوم</th>
                  <th className="text-start font-semibold">الحصة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {slots.map((
                  s: Prisma.TimetableSlotGetPayload<{
                    include: { class: true; subject: true };
                  }>,
                ) => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-800">{teacherNames.get(s.teacherId) ?? "—"}</td>
                    <td className="text-slate-600">{s.class.displayName}</td>
                    <td className="text-slate-600">{s.subject.name}</td>
                    <td className="text-slate-600">{WEEKDAYS[s.weekday]}</td>
                    <td><Badge tone="slate">{s.period}</Badge></td>
                    <td>
                      <FormWithResult
                        action={deleteTimetableSlot} submitLabel="حذف" bare
                        buttonClass="text-xs font-semibold text-red-500 transition hover:text-red-600"
                      >
                        <input type="hidden" name="id" value={s.id} />
                      </FormWithResult>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

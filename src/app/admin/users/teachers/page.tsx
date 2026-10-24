import { Fragment } from "react";
import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { updateStaffUser, deleteTeacherUserAction, replaceTeacherAction } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { TeacherAccountForm } from "@/components/teacher-account-form";
import { TeacherImportForm } from "@/components/teacher-import-form";
import { ActionsCell, StatusCell, TelegramCell, inputClass } from "../_shared";

export default async function TeachersPage() {
  await requireRole("admin");
  const [teachers, subjects, settings] = await Promise.all([
    prisma.user.findMany({
      where: { role: "teacher" },
      orderBy: { createdAt: "asc" },
      include: { teacherProfile: { select: { defaultSubject: true } } },
    }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
  ]);

  return (
    <div>
      <PageHeader title="المعلمون" subtitle="حسابات المعلمين وربطهم بالبوت وموادهم الافتراضية" />

      {/* إنشاء حساب معلم مباشر — الطريقة الموصى بها */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
            <Icon.key className="h-4 w-4" />
          </span>
          إنشاء حساب معلم مباشر
          <Badge tone="emerald">موصى به</Badge>
        </h2>
        <TeacherAccountForm
          subjects={subjects.map((s) => s.name)}
          schoolName={settings?.schoolName ?? "المدرسة"}
          siteUrl={process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}
          botUsername={process.env.TELEGRAM_BOT_USERNAME ?? "aljasr_students_bot"}
        />
      </Card>

      {/* استيراد معلمين جماعي من قالب Excel */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon.import className="h-4 w-4" />
          </span>
          استيراد معلمين جماعي
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          نزّل القالب، عبّئ أسماء المعلمين (المادة من قائمة منسدلة)، ثم ارفعه — تُنشأ الحسابات
          دفعة واحدة وتُطبع قسائم بيانات الدخول للتوزيع.
        </p>
        <a
          href="/admin/users/teachers/import/template"
          className="mb-3 inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-100"
        >
          ⬇ تنزيل قالب المعلمين.xlsx
        </a>
        <TeacherImportForm
          schoolName={settings?.schoolName ?? "المدرسة"}
          siteUrl={process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}
          botUsername={process.env.TELEGRAM_BOT_USERNAME ?? "aljasr_students_bot"}
        />
      </Card>

      {/* استبدال معلم: ينقل الإسنادات وحصص الجدول الساري للبديل ويوقف المغادر */}
      <Card className="mb-4">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-600">⇄</span>
          استبدال معلم
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          لمعلم غادر المدرسة أو بُدّل: تنتقل إسناداته وحصصه السارية في الجدول للبديل فوراً،
          ويُوقف حسابه — سجلاته السابقة تبقى منسوبة إليه.
        </p>
        <FormWithResult action={replaceTeacherAction} submitLabel="نقل الإسنادات والإيقاف">
          <div className="grid w-full gap-2 sm:grid-cols-2">
            <select name="fromId" required className={inputClass}>
              <option value="">المعلم المغادر…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select name="toId" required className={inputClass}>
              <option value="">المعلم البديل…</option>
              {teachers.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </FormWithResult>
        <p className="mt-2 text-xs text-slate-400">
          بديل جديد؟ أنشئ حسابه من بطاقة «إنشاء حساب معلم» أعلاه أولاً ثم نفّذ الاستبدال.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon.users className="h-4 w-4" />
          </span>
          المعلمون
          <Badge tone="brand">{teachers.length}</Badge>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-2 text-start font-semibold">الاسم</th>
                <th className="text-start font-semibold">اسم المستخدم</th>
                <th className="text-start font-semibold">الهاتف</th>
                <th className="text-start font-semibold">المادة</th>
                <th className="text-start font-semibold">تيليجرام</th>
                <th className="text-start font-semibold">الحالة</th>
                <th className="text-start font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-slate-50">
                    <td className="py-2.5 font-medium text-slate-800">
                      <Link href={`/admin/users/teachers/${u.id}`} className="hover:text-brand-600 hover:underline">
                        {u.name}
                      </Link>
                    </td>
                    <td dir="ltr" className="text-slate-500">{u.username ?? "—"}</td>
                    <td dir="ltr" className="text-slate-500">{u.phone ?? "—"}</td>
                    <td className="text-slate-500">{u.teacherProfile?.defaultSubject ?? "—"}</td>
                    <TelegramCell u={u} />
                    <StatusCell u={u} />
                    <ActionsCell u={u} deleteAction={deleteTeacherUserAction} />
                  </tr>
                  <tr className="border-b border-slate-50 last:border-0">
                    <td colSpan={7} className="pb-3">
                      <details>
                        <summary className="w-fit cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-700">
                          تعديل البيانات (الاسم · الهاتف · المادة)
                        </summary>
                        <FormWithResult
                          action={updateStaffUser}
                          submitLabel="حفظ"
                          className="mt-2 flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="userId" value={u.id} />
                          <input name="name" defaultValue={u.name} required placeholder="الاسم" className={inputClass} />
                          <input name="phone" defaultValue={u.phone ?? ""} placeholder="الهاتف — مفتاح ربط البوت" dir="ltr" className={inputClass} />
                          <select name="defaultSubject" defaultValue={u.teacherProfile?.defaultSubject ?? ""} className={inputClass}>
                            <option value="">المادة الافتراضية…</option>
                            {subjects.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                        </FormWithResult>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

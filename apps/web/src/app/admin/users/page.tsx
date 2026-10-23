import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import {
  createStaffInvite,
  createGuardianInvite,
  toggleUser,
  resetUserPassword,
} from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { TeacherAccountForm } from "@/components/teacher-account-form";
import type { Student } from "@prisma/client";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export default async function UsersAdmin() {
  await requireRole("admin");
  const [users, students, subjects, settings] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        teacherProfile: { select: { defaultSubject: true } },
        guardianProfile: {
          select: {
            phone: true,
            children: { where: { verified: true }, select: { id: true } },
          },
        },
      },
    }),
    prisma.student.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
  ]);
  type UserRow = (typeof users)[number];
  const admins = users.filter((u) => u.role === "admin");
  const teachers = users.filter((u) => u.role === "teacher");
  const guardians = users.filter((u) => u.role === "guardian");

  function actionsCell(u: UserRow) {
    return (
      <td className="flex gap-3 py-2">
        <FormWithResult
          action={toggleUser}
          submitLabel={u.isActive ? "تعطيل" : "تفعيل"}
          bare
          buttonClass="text-xs font-semibold text-amber-600 hover:text-amber-700"
        >
          <input type="hidden" name="id" value={u.id} />
        </FormWithResult>
        <FormWithResult action={resetUserPassword} submitLabel="إعادة تعيين" bare>
          <input type="hidden" name="userId" value={u.id} />
        </FormWithResult>
      </td>
    );
  }

  function statusCell(u: UserRow) {
    return (
      <td>
        {u.isActive
          ? <Badge tone="emerald">نشط</Badge>
          : <Badge tone="red">موقوف</Badge>}
      </td>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="المستخدمون والدعوات" subtitle="حسابات المعلمين وأولياء الأمور ورموز الدعوة" />

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

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Icon.users className="h-4 w-4" />
            </span>
            دعوة معلم
          </h2>
          <FormWithResult action={createStaffInvite} submitLabel="إنشاء رمز دعوة">
            <input name="name" placeholder="اسم المعلم" required className={input} />
          </FormWithResult>
          <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
            يُسلَّم الرمز للمعلم ليُنشئ حسابه بنفسه عبر صفحة الدعوة /invite
          </p>
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
              <Icon.parent className="h-4 w-4" />
            </span>
            دعوة ولي أمر
          </h2>
          <FormWithResult action={createGuardianInvite} submitLabel="إنشاء رمز دعوة">
            <select name="studentId" required className={input}>
              <option value="">الطالب…</option>
              {students.map((s: Student) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </FormWithResult>
          <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
            الدعوة تربط ولي الأمر بالطالب المحدد فقط — لا وصول لغيره
          </p>
        </Card>
      </div>

      {/* الإدارة */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-50 text-violet-600">
            <Icon.users className="h-4 w-4" />
          </span>
          الإدارة
          <Badge tone="violet">{admins.length}</Badge>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-2 text-start font-semibold">الاسم</th>
                <th className="text-start font-semibold">اسم المستخدم</th>
                <th className="text-start font-semibold">الحالة</th>
                <th className="text-start font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td dir="ltr" className="text-slate-500">{u.username ?? "—"}</td>
                  {statusCell(u)}
                  {actionsCell(u)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* المعلمون */}
      <Card className="mb-4">
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
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td dir="ltr" className="text-slate-500">{u.username ?? "—"}</td>
                  <td dir="ltr" className="text-slate-500">{u.phone ?? "—"}</td>
                  <td className="text-slate-500">{u.teacherProfile?.defaultSubject ?? "—"}</td>
                  <td>
                    {u.telegramChatId
                      ? <Badge tone="emerald">مرتبط</Badge>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  {statusCell(u)}
                  {actionsCell(u)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* أولياء الأمور */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
            <Icon.parent className="h-4 w-4" />
          </span>
          أولياء الأمور
          <Badge tone="amber">{guardians.length}</Badge>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-2 text-start font-semibold">الاسم</th>
                <th className="text-start font-semibold">اسم المستخدم</th>
                <th className="text-start font-semibold">الهاتف</th>
                <th className="text-start font-semibold">الأبناء</th>
                <th className="text-start font-semibold">تيليجرام</th>
                <th className="text-start font-semibold">الحالة</th>
                <th className="text-start font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {guardians.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td dir="ltr" className="text-slate-500">{u.username ?? "—"}</td>
                  <td dir="ltr" className="text-slate-500">{u.guardianProfile?.phone ?? "—"}</td>
                  <td><Badge tone="brand">{u.guardianProfile?.children.length ?? 0}</Badge></td>
                  <td>
                    {u.telegramChatId
                      ? <Badge tone="emerald">مرتبط</Badge>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  {statusCell(u)}
                  {actionsCell(u)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

import { Fragment } from "react";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { ADMIN_PERMS, parsePerms } from "@app/core";
import { createStaffAccountAction, setStaffPermissionsAction, updateStaffUser } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { ActionsCell, StatusCell, TelegramCell, inputClass } from "../_shared";

/** صلاحيات مخصّصة لكل إداري — المدير يمنحها قسماً قسماً */
function PermBoxes({ name = "perms", checked = [] }: { name?: string; checked?: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {ADMIN_PERMS.map((p) => (
        <label key={p.key} className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            name={name}
            value={p.key}
            defaultChecked={checked.includes(p.key)}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
          />
          {p.label}
        </label>
      ))}
    </div>
  );
}

export default async function StaffPage() {
  await requireRole("admin");
  const staff = await prisma.user.findMany({
    where: { role: "staff" },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="الإداريون المفوَّضون"
        subtitle="حسابات إدارية بصلاحيات مخصّصة يمنحها المدير — دون صلاحيات المدير الكاملة"
      />

      {/* إنشاء حساب إداري */}
      <Card className="mb-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon.users className="h-4 w-4" />
          </span>
          إداري جديد
        </h2>
        <FormWithResult action={createStaffAccountAction} submitLabel="إنشاء الحساب">
          <div className="flex flex-wrap items-end gap-3">
            <input name="name" required placeholder="الاسم — مثال: رئيس شؤون الطلبة" className={inputClass} />
            <input name="phone" placeholder="الهاتف (اختياري)" dir="ltr" className={inputClass} />
          </div>
          <p className="mb-2 mt-3 text-xs font-bold text-slate-500">الصلاحيات الممنوحة:</p>
          <PermBoxes />
        </FormWithResult>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-50 text-violet-600">
            <Icon.key className="h-4 w-4" />
          </span>
          الإداريون الحاليون
          <Badge tone="violet">{staff.length}</Badge>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-2 text-start font-semibold">الاسم</th>
                <th className="text-start font-semibold">اسم المستخدم</th>
                <th className="text-start font-semibold">الهاتف</th>
                <th className="text-start font-semibold">تيليجرام</th>
                <th className="text-start font-semibold">الحالة</th>
                <th className="text-start font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-slate-50">
                    <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                    <td dir="ltr" className="text-slate-500">{u.username ?? "—"}</td>
                    <td dir="ltr" className="text-slate-500">{u.phone ?? "—"}</td>
                    <TelegramCell u={u} />
                    <StatusCell u={u} />
                    <ActionsCell u={u} />
                  </tr>
                  <tr className="border-b border-slate-50 last:border-0">
                    <td colSpan={6} className="pb-3">
                      <details>
                        <summary className="w-fit cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-700">
                          الصلاحيات والبيانات
                        </summary>
                        <div className="mt-2 space-y-3">
                          <FormWithResult
                            action={setStaffPermissionsAction}
                            submitLabel="حفظ الصلاحيات"
                            className="space-y-2"
                          >
                            <input type="hidden" name="userId" value={u.id} />
                            <PermBoxes checked={parsePerms(u.permissions)} />
                          </FormWithResult>
                          <FormWithResult
                            action={updateStaffUser}
                            submitLabel="حفظ البيانات"
                            className="flex flex-wrap items-end gap-2"
                          >
                            <input type="hidden" name="userId" value={u.id} />
                            <input name="name" defaultValue={u.name} required placeholder="الاسم" className={inputClass} />
                            <input name="phone" defaultValue={u.phone ?? ""} placeholder="الهاتف" dir="ltr" className={inputClass} />
                          </FormWithResult>
                        </div>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              ))}
              {!staff.length && (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                  لا إداريون بعد — أنشئ أول حساب من الأعلى
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          ملاحظة: «المستخدمون» و«الإعدادات» و«التقويم» تبقى للمدير فقط ولا تُفوَّض.
          الإداري بلا أي صلاحية يدخل اللوحة ولا يرى قسماً.
        </p>
      </Card>
    </div>
  );
}

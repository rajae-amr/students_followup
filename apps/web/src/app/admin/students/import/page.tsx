import { requireRole } from "@/server/session";
import { importStudents } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import Link from "next/link";

export default async function ImportStudentsPage() {
  await requireRole("admin");
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/students"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <Icon.arrowBack className="h-4 w-4" />
        الطلاب والصفوف
      </Link>

      <PageHeader title="استيراد طلاب جماعي" subtitle="إضافة دفعة طلاب من ملف CSV دفعة واحدة" />

      <Card>
        <div className="mb-4 flex items-start gap-3 rounded-xl bg-brand-50 p-4 text-sm text-brand-800">
          <Icon.import className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <p className="leading-relaxed">
            ملف CSV بترميز UTF-8 وبأعمدة:
            <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs font-semibold" dir="ltr">
              name,class_name,parent_name,parent_phone
            </code>
            — نفس تنسيق النظام القديم. قيمة <code className="font-semibold">class_name</code> يجب
            أن تطابق اسم صف موجود (رمزه أو اسمه المعروض).
          </p>
        </div>

        <FormWithResult action={importStudents} submitLabel="استيراد الملف">
          <input
            type="file" name="file" accept=".csv,text/csv" required
            className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm file:ms-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-1.5 file:font-bold file:text-white"
          />
        </FormWithResult>

        <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
          <Icon.lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          أرقام أولياء الأمور تُحفظ لإنشاء دعواتهم لاحقاً — لا تُنشأ حسابات تلقائياً.
        </p>
      </Card>
    </div>
  );
}

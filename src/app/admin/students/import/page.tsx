import { requirePerm } from "@/server/session";
import { importStudents } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import Link from "next/link";

export default async function ImportStudentsPage() {
  await requirePerm("students");
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/students"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <Icon.arrowBack className="h-4 w-4" />
        الطلاب والصفوف
      </Link>

      <PageHeader title="استيراد طلاب جماعي" subtitle="إضافة دفعة طلاب من قالب Excel جاهز دفعة واحدة" />

      {/* تنزيل القالب */}
      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Icon.import className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-bold text-slate-800">١ · نزّل القالب</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              ملف Excel جاهز بترويسة المدرسة — الصف يُختار من <b>قائمة منسدلة</b> تطابق
              شعبك الفعلية فلا تُكتب أسماء خاطئة، وولي الأمر وهاتفه اختياريان.
            </p>
            <a
              href="/admin/students/import/template"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700"
            >
              ⬇ تنزيل قالب الطلاب.xlsx
            </a>
          </div>
        </div>
      </Card>

      {/* رفع الملف المعبّأ */}
      <Card>
        <h2 className="mb-3 font-bold text-slate-800">٢ · ارفع الملف المعبّأ</h2>
        <FormWithResult action={importStudents} submitLabel="استيراد الملف">
          <input
            type="file" name="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required
            className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm file:ms-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-1.5 file:font-bold file:text-white"
          />
        </FormWithResult>

        <div className="mt-4 space-y-1.5 text-xs leading-relaxed text-slate-400">
          <p className="flex items-start gap-1.5">
            <Icon.lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            يُقبل قالب Excel أو ملف CSV بالتنسيق القديم
            <code dir="ltr" className="rounded bg-slate-50 px-1">name,class_name,parent_name,parent_phone</code>
          </p>
          <p className="flex items-start gap-1.5">
            <Icon.lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            أرقام أولياء الأمور تُحفظ لإنشاء دعواتهم لاحقاً — لا تُنشأ حسابات تلقائياً.
            الأسطر غير المطابقة تُتخطّى وتُذكر أرقامها في النتيجة.
          </p>
        </div>
      </Card>
    </div>
  );
}

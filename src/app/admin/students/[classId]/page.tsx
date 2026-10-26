import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { addStudent, toggleStudent, deleteStudent } from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { BulkAccountsForm } from "@/components/bulk-accounts-form";

const input =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** طلاب صف واحد — بحث + إضافة + ملف مستقل لكل طالب */
export default async function ClassRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePerm("students");
  const { classId } = await params;
  const { q } = await searchParams;

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const settings = await prisma.schoolSettings.findUnique({ where: { id: "school" } });
  const cls = await prisma.classGroup.findUnique({ where: { id: classId } });
  if (!cls) notFound();

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId,
      academicYearId: year?.id,
      student: q
        ? { isActive: true, fullName: { contains: q } }
        : { isActive: true },
    },
    include: {
      student: {
        include: {
          guardians: {
            where: { verified: true },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { student: { fullName: "asc" } },
  });

  // المعطّلون في هذا الصف — مع عدّ سجلاتهم للتمييز بين إعادة التفعيل والحذف النهائي
  const inactive = await prisma.enrollment.findMany({
    where: { classId, academicYearId: year?.id, student: { isActive: false } },
    include: {
      student: {
        include: {
          _count: {
            select: {
              guardians: true, attendanceEntries: true, dailySummaries: true,
              behaviorEntries: true, notes: true, grades: true,
              evaluations: true, reportSnapshots: true, reportViews: true,
            },
          },
        },
      },
    },
    orderBy: { student: { fullName: "asc" } },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={cls.displayName ?? cls.name}
        subtitle={`${enrollments.length} طالباً${q ? ` — نتائج «${q}»` : ""}`}
        crumbs={[
          { label: "الشؤون الأكاديمية" },
          { label: "الطلاب", href: "/admin/students" },
          { label: cls.displayName ?? cls.name },
        ]}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* بحث */}
        <Card className="p-4">
          <form method="get" className="flex items-center gap-2">
            <input
              name="q" defaultValue={q} placeholder="ابحث باسم الطالب…"
              aria-label="بحث في طلاب الصف"
              className={`${input} flex-1`}
            />
            <button className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
              بحث
            </button>
          </form>
        </Card>

        {/* إضافة طالب للصف */}
        <Card className="p-4">
          <FormWithResult action={addStudent} submitLabel="+ إضافة طالب">
            <input type="hidden" name="classId" value={classId} />
            <div className="flex gap-2">
              <input name="fullName" placeholder="اسم الطالب" required className={`${input} flex-1`} />
              <input name="guardianPhone" placeholder="هاتف ولي الأمر" className={`${input} w-36`} dir="ltr" />
            </div>
          </FormWithResult>
        </Card>
      </div>

      {/* حسابات أولياء الأمور الجماعية */}
      <Card className="mb-4 p-4">
        <details>
          <summary className="cursor-pointer text-sm font-bold text-slate-600">
            🔑 حسابات أولياء الأمور — إنشاء جماعي وطباعة بيانات الدخول
          </summary>
          <div className="mt-3">
            <BulkAccountsForm
              classId={classId}
              schoolName={settings?.schoolName ?? "المدرسة"}
              siteUrl={process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}
              botUsername={process.env.TELEGRAM_BOT_USERNAME ?? "aljasr_students_bot"}
            />
          </div>
        </details>
      </Card>

      {enrollments.length === 0 ? (
        <EmptyState
          icon="students"
          title={q ? "لا نتائج لهذا البحث" : "لا طلاب في هذا الصف بعد"}
          hint={q ? "جرّب اسماً آخر" : "أضف أول طالب من النموذج أعلاه أو الاستيراد الجماعي"}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {enrollments.map((e, i) => (
              <li key={e.id}>
                <Link
                  href={`/admin/students/${classId}/${e.studentId}`}
                  className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-brand-50/40"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 transition group-hover:bg-brand-100 group-hover:text-brand-700">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-800 group-hover:text-brand-700">
                      {e.student.fullName}
                    </span>
                    {e.student.guardianPhone && (
                      <span className="text-xs text-slate-400" dir="ltr">
                        {e.student.guardianPhone}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {e.student.guardians.length > 0 && (
                      <Badge tone="emerald">
                        <Icon.check className="h-3 w-3" />
                        ولي أمر
                      </Badge>
                    )}
                    <Icon.arrowBack className="h-4 w-4 text-slate-300 transition group-hover:text-brand-500 rtl:rotate-180" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* الطلاب المعطّلون */}
      {inactive.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-slate-400">
            طلاب موقوفون ({inactive.length})
          </h2>
          <Card>
            <ul className="divide-y divide-slate-100">
              {inactive.map((e) => {
                const records = Object.values(e.student._count).reduce((a, b) => a + b, 0);
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 opacity-75">
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-500">
                      {e.student.fullName}
                    </span>
                    <span className="flex items-center gap-3">
                      <FormWithResult
                        action={toggleStudent} bare
                        buttonClass="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                        submitLabel="✓ إعادة تفعيل"
                      >
                        <input type="hidden" name="id" value={e.studentId} />
                      </FormWithResult>
                      {records === 0 ? (
                        <FormWithResult
                          action={deleteStudent} bare
                          buttonClass="text-xs font-semibold text-red-500 hover:text-red-600"
                          submitLabel="🗑 حذف نهائي"
                        >
                          <input type="hidden" name="id" value={e.studentId} />
                        </FormWithResult>
                      ) : (
                        <span className="text-xs text-slate-300">
                          له سجلات — لا يُحذف
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { linkGuardianToStudent, unlinkGuardian, toggleGuardianReports } from "@/server/actions/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { FormWithResult } from "@/components/form-result";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** ملف ولي الأمر — أبناؤه المرتبطون + ربط وفك الربط */
export default async function GuardianDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      guardianProfile: {
        include: {
          children: {
            include: {
              student: {
                select: {
                  id: true, fullName: true, isActive: true,
                  enrollments: {
                    take: 1,
                    include: { class: { select: { id: true, displayName: true, name: true } } },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!user || user.role !== "guardian" || !user.guardianProfile) notFound();
  const profile = user.guardianProfile;

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const linkedIds = new Set(profile.children.map((c) => c.studentId));
  const linkable = await prisma.student.findMany({
    where: {
      isActive: true,
      id: { notIn: [...linkedIds] },
      enrollments: { some: { academicYearId: year?.id } },
    },
    orderBy: { fullName: "asc" },
    select: {
      id: true, fullName: true,
      enrollments: {
        where: { academicYearId: year?.id },
        take: 1,
        select: { class: { select: { displayName: true, name: true } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={user.name}
        subtitle={[
          user.username && `@${user.username}`,
          profile.phone,
          user.telegramChatId ? "مرتبط بتيليجرام" : "غير مرتبط بتيليجرام",
          !user.isActive && "حساب موقوف",
        ].filter(Boolean).join(" · ") || undefined}
        crumbs={[
          { label: "النظام" },
          { label: "المستخدمون", href: "/admin/users" },
          { label: "أولياء الأمور", href: "/admin/users/guardians" },
          { label: user.name },
        ]}
        backHref="/admin/users/guardians" backLabel="أولياء الأمور"
      />

      {/* ربط ابن جديد */}
      <Card className="mb-4 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon.parent className="h-4 w-4" />
          </span>
          ربط ابن/ابنة بهذا الحساب
        </h2>
        {linkable.length === 0 ? (
          <p className="text-sm text-slate-400">كل الطلاب النشطين مرتبطون بهذا الحساب</p>
        ) : (
          <FormWithResult action={linkGuardianToStudent} submitLabel="ربط">
            <input type="hidden" name="guardianId" value={profile.id} />
            <select name="studentId" required defaultValue="" className={`${input} w-full sm:w-80`}>
              <option value="" disabled>اختر الطالب…</option>
              {linkable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} — {s.enrollments[0]?.class.displayName ?? s.enrollments[0]?.class.name ?? ""}
                </option>
              ))}
            </select>
          </FormWithResult>
        )}
      </Card>

      {/* الأبناء المرتبطون */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.students className="h-5 w-5 text-brand-600" />
          الأبناء المرتبطون
          <Badge tone="brand">{profile.children.length}</Badge>
        </h2>
        {profile.children.length === 0 ? (
          <EmptyState icon="students" title="لا أبناء مرتبطين" hint="اربط أول ابن من النموذج أعلاه" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {profile.children.map((link) => {
              const s = link.student;
              const cls = s.enrollments[0]?.class;
              return (
                <li key={link.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    {cls ? (
                      <Link
                        href={`/admin/students/${cls.id}/${s.id}`}
                        className="font-semibold text-slate-800 hover:text-brand-700 hover:underline"
                      >
                        {s.fullName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-800">{s.fullName}</span>
                    )}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {cls && <span className="text-xs text-slate-400">{cls.displayName ?? cls.name}</span>}
                      {!s.isActive && <Badge tone="red">موقوف</Badge>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={link.verified ? "emerald" : "amber"}>
                      {link.verified ? "موثّق" : "غير موثّق"}
                    </Badge>
                    <FormWithResult
                      action={toggleGuardianReports} bare
                      buttonClass={`text-xs font-semibold ${link.canViewReports ? "text-slate-500 hover:text-slate-600" : "text-brand-600 hover:text-brand-700"}`}
                      submitLabel={link.canViewReports ? "إيقاف التقارير" : "تفعيل التقارير"}
                    >
                      <input type="hidden" name="linkId" value={link.id} />
                    </FormWithResult>
                    <FormWithResult
                      action={unlinkGuardian} bare
                      buttonClass="text-xs font-semibold text-red-500 hover:text-red-600"
                      submitLabel="فك الربط"
                    >
                      <input type="hidden" name="linkId" value={link.id} />
                    </FormWithResult>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export const metadata = { title: "ملف ولي الأمر" };

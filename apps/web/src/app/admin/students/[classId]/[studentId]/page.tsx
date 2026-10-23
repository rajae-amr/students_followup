import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import {
  editStudent, toggleStudent, createGuardianInvite,
  linkGuardianToStudent, unlinkGuardian, toggleGuardianReports,
} from "@/server/actions/admin";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, DayStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { GuardianAccountForm } from "@/components/guardian-account-form";
import { DAY_STATUS_AR, LESSON_STATUS_AR } from "@app/core";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
const lbl = "block text-xs font-medium text-slate-500";
const GENDER_AR: Record<string, string> = { male: "ذكر", female: "أنثى" };
const ENTRY_TONE: Record<string, "emerald" | "red" | "amber" | "violet"> = {
  present: "emerald", absent: "red", excused: "amber", late: "violet",
};
const BEHAVIOR_AR: Record<string, string> = {
  excellent: "ممتاز", committed: "ملتزم", needs_followup: "يحتاج متابعة",
};

/** ملف الطالب الإداري — بياناته، ولي أمره، حضوره وملاحظاته */
export default async function StudentFilePage({
  params,
}: {
  params: Promise<{ classId: string; studentId: string }>;
}) {
  await requireRole("admin");
  const { studentId } = await params;

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const [student, enrollment, classes] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: {
        guardians: {
          include: {
            guardian: {
              include: {
                user: { select: { name: true, isActive: true, telegramChatId: true } },
              },
            },
          },
        },
        dailySummaries: { orderBy: { date: "desc" }, take: 14 },
        attendanceEntries: {
          orderBy: { createdAt: "desc" }, take: 10,
          include: { lessonSession: { include: { subject: { select: { name: true } } } } },
        },
        notes: { orderBy: { date: "desc" }, take: 10 },
        behaviorEntries: { orderBy: { date: "desc" }, take: 10 },
      },
    }),
    prisma.enrollment.findFirst({
      where: { studentId, academicYearId: year?.id },
      include: { class: true },
    }),
    prisma.classGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const cls = enrollment?.class;
  if (!student || !cls) notFound();

  // أولياء متاحون للربط + إعدادات القسيمة
  const linkedIds = new Set(student.guardians.map((g) => g.guardianId));
  const [allGuardians, settings] = await Promise.all([
    prisma.guardianProfile.findMany({
      include: { user: { select: { name: true, isActive: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
  ]);
  const linkable = allGuardians.filter((g) => !linkedIds.has(g.id));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={student.fullName}
        subtitle={`${cls.displayName ?? cls.name}${student.legacyId != null ? ` · سجل قديم #${student.legacyId}` : ""}`}
        backHref={`/admin/students/${cls.id}`}
        backLabel={cls.displayName ?? cls.name}
        actions={
          <FormWithResult
            action={toggleStudent}
            submitLabel={student.isActive ? "إيقاف الطالب" : "تفعيل الطالب"}
            bare
            buttonClass={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              student.isActive
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            <input type="hidden" name="id" value={student.id} />
          </FormWithResult>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* البيانات الأساسية */}
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
            <Icon.students className="h-5 w-5 text-brand-600" />
            البيانات الأساسية
            {!student.isActive && <Badge tone="red">موقوف</Badge>}
          </h2>
          <FormWithResult action={editStudent} submitLabel="حفظ البيانات" className="grid gap-3">
            <div className="grid w-full grid-cols-2 gap-3">
            <input type="hidden" name="id" value={student.id} />
            <label className={`${lbl} col-span-2`}>الاسم الكامل
              <input name="fullName" defaultValue={student.fullName} required className={`${input} mt-1 w-full`} />
            </label>
            <label className={lbl}>الصف
              <select name="classId" defaultValue={cls.id} className={`${input} mt-1 w-full`}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.displayName ?? c.name}</option>
                ))}
              </select>
            </label>
            <label className={lbl}>الجنس
              <select name="gender" defaultValue={student.gender ?? ""} className={`${input} mt-1 w-full`}>
                <option value="">—</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </label>
            <label className={lbl}>اسم ولي الأمر
              <input name="guardianName" defaultValue={student.guardianName ?? ""} className={`${input} mt-1 w-full`} />
            </label>
            <label className={lbl}>هاتف ولي الأمر
              <input name="guardianPhone" defaultValue={student.guardianPhone ?? ""} dir="ltr" className={`${input} mt-1 w-full`} />
            </label>
            </div>
          </FormWithResult>
        </Card>

        {/* أولياء الأمور — ربط وإدارة */}
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
            <Icon.parent className="h-5 w-5 text-accent-600" />
            أولياء الأمور
            <Badge tone="brand">{student.guardians.length}</Badge>
          </h2>

          {student.guardians.length > 0 && (
            <ul className="mb-4 space-y-2">
              {student.guardians.map((g) => (
                <li key={g.id} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold text-slate-800">
                      <Icon.parent className="h-4 w-4 text-accent-600" />
                      {g.guardian.user.name}
                      {g.guardian.phone && (
                        <span className="text-xs font-normal text-slate-400" dir="ltr">{g.guardian.phone}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {g.verified ? <Badge tone="emerald">موثق</Badge> : <Badge tone="slate">غير موثق</Badge>}
                      {g.guardian.user.telegramChatId && <Badge tone="brand">تيليجرام</Badge>}
                      {!g.guardian.user.isActive && <Badge tone="red">موقوف</Badge>}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2">
                    <FormWithResult
                      action={toggleGuardianReports}
                      submitLabel={g.canViewReports ? "إخفاء التقارير" : "إظهار التقارير"}
                      bare
                      buttonClass={g.canViewReports
                        ? "text-xs font-semibold text-slate-500 hover:text-amber-600"
                        : "text-xs font-semibold text-brand-600 hover:text-brand-700"}
                    >
                      <input type="hidden" name="linkId" value={g.id} />
                    </FormWithResult>
                    {!g.canViewReports && (
                      <span className="text-[10px] text-amber-600">التقارير مخفية عنه</span>
                    )}
                    <FormWithResult
                      action={unlinkGuardian}
                      submitLabel="فك الربط"
                      bare
                      buttonClass="text-xs font-semibold text-slate-400 hover:text-red-600"
                    >
                      <input type="hidden" name="linkId" value={g.id} />
                    </FormWithResult>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* ربط ولي أمر قائم (أخ مسجل لديه حساب) */}
          {linkable.length > 0 && (
            <div className="mb-4">
              <FormWithResult action={linkGuardianToStudent} submitLabel="ربط">
                <input type="hidden" name="studentId" value={student.id} />
                <label className={lbl}>ربط ولي أمر موجود
                  <select name="guardianId" required className={`${input} mt-1 w-full`}>
                    <option value="">اختر ولي الأمر…</option>
                    {linkable.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.user.name}{g.phone ? ` — ${g.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </FormWithResult>
            </div>
          )}

          {/* إنشاء حساب جديد + دعوة تقليدية */}
          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">إنشاء حساب ولي أمر وربطه بالطالب:</p>
            <GuardianAccountForm
              studentId={student.id}
              defaultName={
                student.guardianName && student.guardianName !== "ولي الأمر"
                  ? student.guardianName
                  : `ولي أمر ${student.fullName.split(" ").slice(0, 2).join(" ")}`
              }
              defaultPhone={student.guardianPhone ?? ""}
              schoolName={settings?.schoolName ?? "المدرسة"}
              siteUrl={process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}
              botUsername={process.env.TELEGRAM_BOT_USERNAME ?? "aljasr_students_bot"}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600">
                أو دعوة تقليدية برمز (/invite)
              </summary>
              <div className="mt-2">
                <FormWithResult action={createGuardianInvite} submitLabel="إنشاء رمز دعوة">
                  <input type="hidden" name="studentId" value={student.id} />
                </FormWithResult>
              </div>
            </details>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* الحضور اليومي */}
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.attendance className="h-5 w-5 text-brand-600" />
            الحضور اليومي
            <Badge tone="slate">آخر 14 يوماً</Badge>
          </h2>
          {student.dailySummaries.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">لا سجلات حضور بعد</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {student.dailySummaries.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-600">
                    {d.date.toLocaleDateString("ar", { weekday: "short", day: "numeric", month: "numeric" })}
                  </span>
                  <DayStatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* تفاصيل الحصص */}
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.schedule className="h-5 w-5 text-accent-600" />
            آخر الحصص
          </h2>
          {student.attendanceEntries.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">لا سجلات حصص بعد</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {student.attendanceEntries.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-600">
                    {e.lessonSession.date.toLocaleDateString("ar", { day: "numeric", month: "numeric" })}
                    {" — "}{e.lessonSession.subject.name} (ح{e.lessonSession.period})
                  </span>
                  <Badge tone={ENTRY_TONE[e.status] ?? "emerald"}>
                    {LESSON_STATUS_AR[e.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* الملاحظات والسلوك */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.reports className="h-5 w-5 text-brand-600" />
            الملاحظات
          </h2>
          {student.notes.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">لا ملاحظات</p>
          ) : (
            <ul className="space-y-2">
              {student.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <p className="text-slate-700">{n.text}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {n.date.toLocaleDateString("ar")} · {n.category}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.behavior className="h-5 w-5 text-accent-600" />
            سجل السلوك
          </h2>
          {student.behaviorEntries.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">لا سجلات سلوك</p>
          ) : (
            <ul className="space-y-2">
              {student.behaviorEntries.map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">
                    {b.date.toLocaleDateString("ar")}
                    {b.text && <span className="text-slate-400"> — {b.text}</span>}
                  </span>
                  {b.category && (
                    <Badge tone={b.category === "needs_followup" ? "amber" : "emerald"}>
                      {BEHAVIOR_AR[b.category] ?? b.category}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

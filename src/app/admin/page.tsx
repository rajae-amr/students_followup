import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { StatCard } from "@/components/ui/stat-card";
import { NavCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function AdminPage() {
  await requireRole("admin", "staff");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [students, teachers, classes, subjects, sessionsToday, guardians] =
    await Promise.all([
      prisma.student.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: "teacher", isActive: true } }),
      prisma.classGroup.count({ where: { isActive: true } }),
      prisma.subject.count({ where: { isActive: true } }),
      prisma.lessonSession.count({
        where: { date: { gte: today }, status: "submitted" },
      }),
      prisma.user.count({ where: { role: "guardian", isActive: true } }),
    ]);

  const nav = [
    { href: "/admin/students", title: "الطلاب", subtitle: `${students} طالب في ${classes} صفاً`, icon: "students" as const },
    { href: "/admin/classes", title: "الصفوف والمستويات", subtitle: `${classes} صفاً نشطاً`, icon: "school" as const },
    { href: "/admin/assignments", title: "الإسنادات", subtitle: `توزيع ${subjects} مادة على المعلمين`, icon: "users" as const },
    { href: "/admin/attendance", title: "سجلات الحضور", subtitle: "تصفح يومي لكل صف", icon: "attendance" as const },
    { href: "/admin/excuses", title: "الأعذار", subtitle: "طلبات أولياء الأمور", icon: "check" as const },
    { href: "/admin/analytics", title: "التحليلات", subtitle: "مؤشرات الحضور بيانياً", icon: "grades" as const },
    { href: "/admin/reports", title: "التقارير", subtitle: "تقارير الطلاب والتلخيص الأسبوعي", icon: "reports" as const },
    { href: "/admin/timetable", title: "الجدولة", subtitle: "توليد ونشر الجدول المدرسي", icon: "schedule" as const },
    { href: "/admin/users", title: "المستخدمون", subtitle: `${teachers} معلم · ${guardians} ولي أمر`, icon: "key" as const },
    { href: "/admin/announcements", title: "الإعلانات", subtitle: "لوحة إعلانات المدرسة", icon: "bell" as const },
    { href: "/absence", title: "تنبيهات الغياب", subtitle: "إشعار أولياء الأمور", icon: "warning" as const, iconClass: "bg-red-50 text-red-600" },
    { href: "/admin/settings", title: "الإعدادات والتقويم", subtitle: "عتبات وفصول وأيام الدوام", icon: "settings" as const },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="لوحة الإدارة" subtitle="نظرة شاملة على المدرسة والتنقل بين الأقسام" />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الطلاب" value={students} icon="students" />
        <StatCard label="المعلمون" value={teachers} icon="users" tone="violet" />
        <StatCard label="الصفوف" value={classes} icon="school" tone="accent" />
        <StatCard label="حصص معتمدة اليوم" value={sessionsToday} icon="check" tone="emerald" />
      </div>

      <h2 className="mb-4 font-bold text-slate-800">الأقسام</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {nav.map((c) => (
          <NavCard
            key={c.href}
            href={c.href}
            title={c.title}
            subtitle={c.subtitle}
            icon={c.icon}
            iconClass={"iconClass" in c ? c.iconClass : undefined}
          />
        ))}
      </div>
    </div>
  );
}

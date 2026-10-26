import type { ShellLink } from "./app-shell";
import type { Role } from "@app/core";

export const TEACHER_LINKS: ShellLink[] = [
  { href: "/teacher", label: "حصصي", icon: "home", exact: true },
  { href: "/teacher/grades", label: "الدرجات", icon: "grades" },
  { href: "/teacher/evaluation", label: "التقييم", icon: "evaluation" },
  { href: "/teacher/plan", label: "الخطة الأسبوعية", icon: "book" },
  { href: "/absence", label: "تنبيهات الغياب", icon: "bell" },
];

export const ADMIN_LINKS: ShellLink[] = [
  { href: "/admin", label: "لوحة التحكم", icon: "home", exact: true, perm: "dashboard" },
  // الهيكل الأكاديمي — من يدرّس من وماذا وأين
  { href: "/admin/students", label: "الطلاب", icon: "students", perm: "students", group: "الهيكل الأكاديمي" },
  { href: "/admin/classes", label: "الصفوف", icon: "school", perm: "students", group: "الهيكل الأكاديمي" },
  { href: "/admin/subjects", label: "المواد", icon: "book", perm: "timetable", group: "الهيكل الأكاديمي" },
  { href: "/admin/assignments", label: "الإسنادات", icon: "users", perm: "timetable", group: "الهيكل الأكاديمي" },
  // اليوم الدراسي — ما يحدث كل يوم
  { href: "/admin/attendance", label: "الحضور", icon: "attendance", perm: "attendance", group: "اليوم الدراسي" },
  { href: "/admin/excuses", label: "الأعذار", icon: "check", perm: "attendance", group: "اليوم الدراسي" },
  { href: "/admin/duties", label: "الإشراف", icon: "clock", perm: "duties", group: "اليوم الدراسي" },
  { href: "/admin/analytics", label: "التحليلات", icon: "grades", perm: "attendance", group: "اليوم الدراسي" },
  // التواصل والتقارير — ما يصل أولياء الأمور
  { href: "/admin/reports", label: "توليد التقارير", icon: "reports", perm: "reports", exact: true, group: "التواصل والتقارير" },
  { href: "/admin/reports/snapshots", label: "لقطات التقارير", icon: "reports", perm: "reports", group: "التواصل والتقارير" },
  { href: "/admin/reports/outbox", label: "سجل الإرسال", icon: "bell", perm: "reports", group: "التواصل والتقارير" },
  { href: "/admin/plans", label: "الخطط الأسبوعية", icon: "book", perm: "plans", group: "التواصل والتقارير" },
  { href: "/admin/announcements", label: "الإعلانات", icon: "bell", perm: "reports", group: "التواصل والتقارير" },
  { href: "/absence", label: "تنبيهات الغياب", icon: "warning", perm: "attendance", group: "التواصل والتقارير" },
  // الجدولة — عملية موسمية ثقيلة
  { href: "/admin/timetable", label: "الجدولة", icon: "schedule", perm: "timetable", group: "الجدولة" },
  // النظام
  { href: "/admin/users", label: "المستخدمون", icon: "users", group: "النظام" },
  { href: "/admin/settings", label: "الإعدادات", icon: "settings", group: "النظام" },
];

export const GUARDIAN_LINKS: ShellLink[] = [
  { href: "/parent", label: "أبنائي", icon: "home", exact: true },
  { href: "/parent/plans", label: "الخطط الأسبوعية", icon: "book" },
];

export function linksFor(role: Role): ShellLink[] {
  if (role === "admin" || role === "staff") return ADMIN_LINKS;
  if (role === "guardian") return GUARDIAN_LINKS;
  return TEACHER_LINKS;
}

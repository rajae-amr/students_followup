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
  { href: "/admin/students", label: "الطلاب", icon: "students", perm: "students", group: "الشؤون الأكاديمية" },
  { href: "/admin/classes", label: "الصفوف", icon: "school", perm: "students", group: "الشؤون الأكاديمية" },
  { href: "/admin/attendance", label: "الحضور", icon: "attendance", perm: "attendance", group: "الشؤون الأكاديمية" },
  { href: "/admin/plans", label: "الخطط الأسبوعية", icon: "reports", perm: "plans", group: "الشؤون الأكاديمية" },
  { href: "/admin/reports", label: "التقارير", icon: "reports", perm: "reports", group: "الشؤون الأكاديمية" },
  { href: "/admin/timetable", label: "الجدولة", icon: "schedule", perm: "timetable", group: "الجدولة والتنظيم" },
  { href: "/admin/subjects", label: "المواد", icon: "book", perm: "timetable", group: "الجدولة والتنظيم" },
  { href: "/admin/duties", label: "الإشراف", icon: "clock", perm: "duties", group: "الجدولة والتنظيم" },
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

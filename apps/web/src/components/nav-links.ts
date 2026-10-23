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
  { href: "/admin", label: "لوحة التحكم", icon: "home", exact: true },
  { href: "/admin/students", label: "الطلاب", icon: "students" },
  { href: "/admin/schedule", label: "الجدول", icon: "schedule" },
  { href: "/admin/subjects", label: "المواد", icon: "book" },
  { href: "/admin/plans", label: "الخطط الأسبوعية", icon: "reports" },
  { href: "/admin/attendance", label: "الحضور", icon: "attendance" },
  { href: "/admin/reports", label: "التقارير", icon: "reports" },
  { href: "/admin/users", label: "المستخدمون", icon: "users" },
  { href: "/admin/settings", label: "الإعدادات", icon: "settings" },
];

export const GUARDIAN_LINKS: ShellLink[] = [
  { href: "/parent", label: "أبنائي", icon: "home", exact: true },
  { href: "/parent/plans", label: "الخطط الأسبوعية", icon: "book" },
];

export function linksFor(role: Role): ShellLink[] {
  if (role === "admin") return ADMIN_LINKS;
  if (role === "guardian") return GUARDIAN_LINKS;
  return TEACHER_LINKS;
}

/**
 * نموذج الفاعل والصلاحيات — نواة مستقلة عن Next.js.
 * كل خدمة كتابة تستقبل Actor وتحقق النطاق داخلها.
 */

export type Role = "admin" | "staff" | "teacher" | "guardian";

/**
 * أقسام لوحة الإدارة القابلة للتفويض لدور "staff" — كل مفتاح يفتح
 * صفحاته وإجراءاته لذلك الإداري تحديداً؛ المدير يملك الكل دائماً.
 * لا تُفوَّض: إدارة المستخدمين والإعدادات والتقويم (تبقى للمدير).
 */
export type AdminPerm =
  | "students"   // الطلاب والشعب وأولياء الأمور
  | "attendance" // مراجعة كشوف الحضور وتنبيهات الغياب
  | "plans"      // الخطط الأسبوعية
  | "duties"     // جدول الإشراف والمناوبات
  | "timetable"  // الجدولة والمواد والتكاليف
  | "reports"    // تقارير أولياء الأمور والإرسال
  | "export";    // تصدير Excel

export const ADMIN_PERMS: { key: AdminPerm; label: string }[] = [
  { key: "students", label: "الطلاب وأولياء الأمور" },
  { key: "attendance", label: "الحضور والتنبيهات" },
  { key: "plans", label: "الخطط الأسبوعية" },
  { key: "duties", label: "الإشراف والمناوبات" },
  { key: "timetable", label: "الجدولة والمواد" },
  { key: "reports", label: "التقارير والإرسال" },
  { key: "export", label: "تصدير Excel" },
];

/** يقرأ قائمة الصلاحيات المخزّنة في User.permissions (JSON) */
export function parsePerms(value: unknown): AdminPerm[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set(ADMIN_PERMS.map((p) => p.key));
  return value.filter((p): p is AdminPerm => typeof p === "string" && valid.has(p as AdminPerm));
}

export interface Actor {
  userId: string;
  role: Role;
  isActive: boolean;
}

export class ForbiddenError extends Error {
  constructor(message = "غير مصرح بهذا الإجراء") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "العنصر غير موجود") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function requireActive(actor: Actor): void {
  if (!actor.isActive) throw new ForbiddenError("الحساب موقوف");
}

export function requireAdmin(actor: Actor): void {
  requireActive(actor);
  if (actor.role !== "admin") throw new ForbiddenError();
}

export function requireTeacher(actor: Actor): void {
  requireActive(actor);
  if (actor.role !== "teacher" && actor.role !== "admin")
    throw new ForbiddenError();
}

export function requireGuardian(actor: Actor): void {
  requireActive(actor);
  if (actor.role !== "guardian") throw new ForbiddenError();
}

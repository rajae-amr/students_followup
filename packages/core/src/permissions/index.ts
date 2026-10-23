/**
 * نموذج الفاعل والصلاحيات — نواة مستقلة عن Next.js.
 * كل خدمة كتابة تستقبل Actor وتحقق النطاق داخلها.
 */

export type Role = "admin" | "teacher" | "guardian";

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

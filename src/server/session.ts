import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@app/auth";
import { prisma } from "@app/db";
import { parsePerms, type Actor, type AdminPerm, type Role } from "@app/core";

/** قراءة الجلسة مرة واحدة لكل طلب */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** الفاعل الحالي أو null */
export async function getActor(): Promise<Actor | null> {
  const session = await getSession();
  if (!session?.user) return null;
  const u = session.user as {
    id: string;
    role?: string;
    isActive?: boolean;
  };
  return {
    userId: u.id,
    role: (u.role ?? "teacher") as Role,
    isActive: u.isActive ?? true,
  };
}

/** يتطلب دخولاً — يحوّل إلى /login عند غياب الجلسة */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!actor.isActive) redirect("/login?error=disabled");
  return actor;
}

/** بوابة كلمة المرور الأولية — تُطبَّق على كل دخول مفوَّض */
async function passwordGate() {
  const session = await getSession();
  if ((session?.user as { mustChangePassword?: boolean })?.mustChangePassword)
    redirect("/password?first=1");
}

/** صلاحيات الإداري المفوَّض — تُقرأ من القاعدة وتُخزَّن لكل طلب */
export const getStaffPerms = cache(async (userId: string) => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  return parsePerms(u?.permissions);
});

/** يتطلب دوراً محدداً — يحوّل للوحة الدور عند عدم التطابق، ولـ/password عند كلمة مرور أولية */
export async function requireRole(...roles: Role[]): Promise<Actor> {
  const actor = await requireActor();
  if (!roles.includes(actor.role)) redirect(homeFor(actor.role));
  await passwordGate();
  return actor;
}

/**
 * يتطلب صلاحية قسم إداري: المدير يمر دائماً، و"staff" يمر إن فُوِّض القسم.
 * alsoRoles: أدوار أخرى تمر دون صلاحية (مثل "teacher" في العمليات المشتركة).
 */
export async function requirePerm(perm: AdminPerm, ...alsoRoles: Role[]): Promise<Actor> {
  const actor = await requireActor();
  const allowed =
    actor.role === "admin" ||
    alsoRoles.includes(actor.role) ||
    (actor.role === "staff" && (await getStaffPerms(actor.userId)).includes(perm));
  if (!allowed) redirect(homeFor(actor.role));
  await passwordGate();
  return actor;
}

/**
 * يرفع الإداري المفوَّض لدور إداري داخلياً عند تمريره لخدمات النواة —
 * التفويض تحقّق مسبقاً عبر requirePerm؛ الدور الأصلي يبقى للجلسة والتدقيق.
 */
export function asAdmin(actor: Actor): Actor {
  return actor.role === "staff" ? { ...actor, role: "admin" } : actor;
}

export function homeFor(role: Role): string {
  switch (role) {
    case "admin":
    case "staff":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "guardian":
      return "/parent";
  }
}

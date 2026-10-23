import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@app/auth";
import type { Actor, Role } from "@app/core";

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

/** يتطلب دوراً محدداً — يحوّل للوحة الدور عند عدم التطابق، ولـ/password عند كلمة مرور أولية */
export async function requireRole(...roles: Role[]): Promise<Actor> {
  const actor = await requireActor();
  if (!roles.includes(actor.role)) redirect(homeFor(actor.role));
  const session = await getSession();
  if ((session?.user as { mustChangePassword?: boolean })?.mustChangePassword)
    redirect("/password?first=1");
  return actor;
}

export function homeFor(role: Role): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "guardian":
      return "/parent";
  }
}

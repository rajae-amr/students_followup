import type { Metadata } from "next";
import { requireRole, getStaffPerms } from "@/server/session";
import { prisma } from "@app/db";
import { AppShell } from "@/components/app-shell";
import { ADMIN_LINKS } from "@/components/nav-links";

export const metadata: Metadata = { title: "لوحة الإدارة" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // staff يدخل اللوحة لكن بروابط أقسامه المفوَّضة فقط؛ المستخدمون/الإعدادات للمدير
  const actor = await requireRole("admin", "staff");
  const [user, perms] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true },
    }),
    actor.role === "staff" ? getStaffPerms(actor.userId) : Promise.resolve([]),
  ]);
  const links =
    actor.role === "staff"
      ? ADMIN_LINKS.filter((l) => l.perm === "dashboard" || perms.includes(l.perm as never))
      : ADMIN_LINKS;
  return (
    <AppShell userName={user?.name ?? "الإدارة"} role={actor.role} links={links}>
      {children}
    </AppShell>
  );
}

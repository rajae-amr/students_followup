import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { AppShell } from "@/components/app-shell";
import { ADMIN_LINKS } from "@/components/nav-links";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireRole("admin");
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  });
  return (
    <AppShell userName={user?.name ?? "الإدارة"} role={actor.role} links={ADMIN_LINKS}>
      {children}
    </AppShell>
  );
}

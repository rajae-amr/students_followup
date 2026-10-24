import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { AppShell } from "@/components/app-shell";
import { GUARDIAN_LINKS } from "@/components/nav-links";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireRole("guardian");
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  });
  return (
    <AppShell userName={user?.name ?? "ولي أمر"} role={actor.role} links={GUARDIAN_LINKS}>
      {children}
    </AppShell>
  );
}

import type { Metadata } from "next";
import { requireActor } from "@/server/session";
import { prisma } from "@app/db";
import { AppShell } from "@/components/app-shell";
import { linksFor } from "@/components/nav-links";

export const metadata: Metadata = { title: "الإشعارات" };

/** تخطيط مركز الإشعارات — غلاف موحد لكل الأدوار */
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  });
  return (
    <AppShell userName={user?.name ?? "مستخدم"} role={actor.role} links={linksFor(actor.role)}>
      {children}
    </AppShell>
  );
}

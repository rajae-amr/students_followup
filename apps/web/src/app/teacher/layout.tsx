import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { AppShell } from "@/components/app-shell";
import { TEACHER_LINKS } from "@/components/nav-links";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireRole("teacher", "admin");
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  });
  return (
    <AppShell userName={user?.name ?? "معلم"} role={actor.role} links={TEACHER_LINKS}>
      {children}
    </AppShell>
  );
}

import { getActor } from "@/server/session";
import { prisma } from "@app/db";
import { NotificationBell } from "./notification-bell";

/** غلاف خادمي — يجلب عدّاد وآخر الإشعارات للمستخدم الحالي */
export async function NotificationBellServer({ dark = false, up = false }: { dark?: boolean; up?: boolean }) {
  const actor = await getActor();
  if (!actor) return null;

  const [unread, latest] = await Promise.all([
    prisma.notification.count({ where: { userId: actor.userId, readAt: null } }),
    prisma.notification.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, href: true, createdAt: true, readAt: true },
    }),
  ]);

  return (
    <NotificationBell
      dark={dark}
      up={up}
      unread={unread}
      items={latest.map((n) => ({
        id: n.id,
        title: n.title,
        href: n.href,
        createdAt: n.createdAt.toISOString(),
        read: !!n.readAt,
      }))}
    />
  );
}

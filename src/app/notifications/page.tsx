import { requireActor } from "@/server/session";
import { prisma } from "@app/db";
import { markAllNotificationsRead } from "@/server/notify";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { NotificationRow } from "./row";

const PAGE_SIZE = 20;

export type NotificationDto = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  type: string;
  read: boolean;
  date: string;
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("ar-OM", { weekday: "long", day: "numeric", month: "long" }) +
    " — " + d.toLocaleTimeString("ar-OM", { hour: "2-digit", minute: "2-digit" });
}

/** مركز الإشعارات — سجل كامل مرقّم مع تمييز المقروء */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await requireActor();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [total, unread, items] = await Promise.all([
    prisma.notification.count({ where: { userId: actor.userId } }),
    prisma.notification.count({ where: { userId: actor.userId, readAt: null } }),
    prisma.notification.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);

  const dtos: NotificationDto[] = items.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    href: n.href,
    type: n.type,
    read: !!n.readAt,
    date: fmtDate(n.createdAt),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="الإشعارات"
        subtitle={unread ? `${unread} إشعار غير مقروء` : "كل الإشعارات مقروءة"}
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <button className="rounded-xl bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-100">
                تعيين الكل كمقروء
              </button>
            </form>
          ) : undefined
        }
      />

      {dtos.length === 0 ? (
        <EmptyState icon="bell" title="لا إشعارات" hint="ستظهر هنا تنبيهات الغياب والإعلانات والخطط" />
      ) : (
        <ul className="space-y-2">
          {dtos.map((n) => (
            <li key={n.id}>
              <NotificationRow n={n} />
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} pages={pages} total={total} />
    </div>
  );
}

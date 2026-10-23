import Link from "next/link";
import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

export default async function UsersOverview() {
  await requireRole("admin");
  const users = await prisma.user.findMany({
    select: { role: true, isActive: true, telegramChatId: true },
  });

  const sections = [
    {
      key: "teacher", title: "المعلمون", href: "/admin/users/teachers",
      desc: "إنشاء حسابات، المادة الافتراضية، وهاتف ربط البوت",
      icon: "users" as const, tone: "brand" as const, iconBg: "bg-brand-50 text-brand-600",
    },
    {
      key: "guardian", title: "أولياء الأمور", href: "/admin/users/guardians",
      desc: "دعوات الربط بالأبناء وحسابات البوابة",
      icon: "parent" as const, tone: "amber" as const, iconBg: "bg-accent-50 text-accent-600",
    },
    {
      key: "admin", title: "الإدارة", href: "/admin/users/admins",
      desc: "حسابات الإدارة وربط تيليجرام الإشرافي",
      icon: "key" as const, tone: "violet" as const, iconBg: "bg-violet-50 text-violet-600",
    },
  ];

  return (
    <div>
      <PageHeader title="المستخدمون والدعوات" subtitle="إدارة حسابات المعلمين وأولياء الأمور والإدارة" />

      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((s) => {
          const rows = users.filter((u) => u.role === s.key);
          const linked = rows.filter((u) => u.telegramChatId).length;
          const I = Icon[s.icon];
          return (
            <Link key={s.key} href={s.href}>
              <Card className="h-full transition hover:border-brand-200 hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${s.iconBg}`}>
                    <I className="h-5 w-5" />
                  </span>
                  <h2 className="font-bold text-slate-800">{s.title}</h2>
                  <Badge tone={s.tone}>{rows.length}</Badge>
                </div>
                <p className="mb-3 text-xs leading-relaxed text-slate-400">{s.desc}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    نشط {rows.filter((u) => u.isActive).length}
                    {" · "}مرتبط بالبوت {linked}
                  </span>
                  <span className="font-semibold text-brand-600">إدارة ←</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

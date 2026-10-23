import { requireRole } from "@/server/session";
import { prisma } from "@app/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { ActionsCell, StatusCell, TelegramCell } from "../_shared";

export default async function GuardiansPage() {
  await requireRole("admin");
  const guardians = await prisma.user.findMany({
    where: { role: "guardian" },
    orderBy: { createdAt: "asc" },
    include: {
      guardianProfile: {
        select: {
          phone: true,
          children: { where: { verified: true }, select: { id: true } },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader title="أولياء الأمور" subtitle="دعوات ربط الأبناء وحسابات بوابة أولياء الأمور" />

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
            <Icon.parent className="h-4 w-4" />
          </span>
          أولياء الأمور
          <Badge tone="amber">{guardians.length}</Badge>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-2 text-start font-semibold">الاسم</th>
                <th className="text-start font-semibold">اسم المستخدم</th>
                <th className="text-start font-semibold">الهاتف</th>
                <th className="text-start font-semibold">الأبناء</th>
                <th className="text-start font-semibold">تيليجرام</th>
                <th className="text-start font-semibold">الحالة</th>
                <th className="text-start font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {guardians.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td dir="ltr" className="text-slate-500">{u.username ?? "—"}</td>
                  <td dir="ltr" className="text-slate-500">{u.guardianProfile?.phone ?? "—"}</td>
                  <td><Badge tone="brand">{u.guardianProfile?.children.length ?? 0}</Badge></td>
                  <TelegramCell u={u} />
                  <StatusCell u={u} />
                  <ActionsCell u={u} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

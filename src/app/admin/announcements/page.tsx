import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { createAnnouncement, deleteAnnouncement } from "@/server/actions/announcements";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormWithResult } from "@/components/form-result";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

const AUDIENCE_AR: Record<string, string> = {
  all: "الجميع",
  guardians: "أولياء الأمور",
  teachers: "المعلمون",
};
const AUDIENCE_TONE: Record<string, "brand" | "amber" | "violet"> = {
  all: "brand", guardians: "amber", teachers: "violet",
};

/** لوحة الإعلانات — نشر للأهل/المعلمين مع إشعار داخلي */
export default async function AnnouncementsPage() {
  await requirePerm("reports");

  const items = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="لوحة الإعلانات"
        subtitle="إعلان يصل الجمهور المستهدف كإشعار فوري ويظهر في بوابته"
        crumbs={[{ label: "الشؤون الأكاديمية" }, { label: "الإعلانات" }]}
      />

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-700">إعلان جديد</h2>
        <FormWithResult action={createAnnouncement} submitLabel="نشر الإعلان" className="space-y-3">
          <input name="title" required maxLength={120} placeholder="عنوان الإعلان" className={input} />
          <textarea name="body" required rows={3} maxLength={1000} placeholder="نص الإعلان…" className={input} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">الجمهور:</span>
            {(["all", "guardians", "teachers"] as const).map((a) => (
              <label key={a} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 has-checked:bg-brand-50 has-checked:text-brand-700 has-checked:ring-brand-300">
                <input type="radio" name="audience" value={a} defaultChecked={a === "all"} className="accent-brand-600" />
                {AUDIENCE_AR[a]}
              </label>
            ))}
          </div>
        </FormWithResult>
      </Card>

      {items.length === 0 ? (
        <EmptyState icon="reports" title="لا إعلانات بعد" hint="أول إعلان تنشره يظهر لأولياء الأمور والمعلمين مع إشعار" />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800">{a.title}</span>
                  <Badge tone={AUDIENCE_TONE[a.audience] ?? "slate"}>{AUDIENCE_AR[a.audience] ?? a.audience}</Badge>
                  <span className="ms-auto flex items-center gap-3 text-xs text-slate-400">
                    {a.createdBy?.name && <span>{a.createdBy.name}</span>}
                    <span>{a.createdAt.toLocaleDateString("ar-OM", { day: "numeric", month: "long" })}</span>
                    <FormWithResult
                      action={deleteAnnouncement} bare
                      buttonClass="text-xs font-semibold text-red-500 hover:text-red-600"
                      submitLabel="حذف"
                    >
                      <input type="hidden" name="id" value={a.id} />
                    </FormWithResult>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const metadata = { title: "لوحة الإعلانات" };

import Link from "next/link";
import { requireRole } from "@/server/session";
import { publicationsForGuardian } from "@app/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

export default async function ParentPlansPage() {
  const actor = await requireRole("guardian");
  const pubs = await publicationsForGuardian(actor);
  const fmt = (d: Date) =>
    d.toLocaleDateString("ar", { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="الخطط الأسبوعية"
        subtitle="الخطط الموحّدة المنشورة لصفوف أبنائك"
      />

      {!pubs.length ? (
        <EmptyState
          icon="book"
          title="لا خطط منشورة بعد"
          hint="ستظهر هنا الخطة الأسبوعية الموحّدة فور نشرها من الإدارة"
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {pubs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon.book className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-800">
                      خطة {p.className} — أسبوع {fmt(p.weekStart)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {p.subjects} مواد · نُشرت {fmt(p.publishedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/parent/plans/${p.id}`}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    عرض
                  </Link>
                  <a
                    href={`/api/plans/${p.id}/pdf`}
                    target="_blank"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    ⬇ PDF
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

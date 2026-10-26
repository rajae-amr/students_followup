import Link from "next/link";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { decideExcuse } from "@/server/actions/excuses";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormWithResult } from "@/components/form-result";

const fmtDay = (d: Date) =>
  d.toLocaleDateString("ar-OM", { weekday: "long", day: "numeric", month: "long" });

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100";

/** إدارة الأعذار الإلكترونية — قيد المراجعة أولاً ثم السجل */
export default async function ExcusesPage() {
  await requirePerm("attendance");

  const [pending, decided] = await Promise.all([
    prisma.excuse.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: {
        student: { select: { id: true, fullName: true, enrollments: { take: 1, include: { class: { select: { id: true, displayName: true, name: true } } } } } },
        guardian: { select: { user: { select: { name: true, phone: true } } } },
      },
    }),
    prisma.excuse.findMany({
      where: { status: { not: "pending" } },
      orderBy: { decidedAt: "desc" },
      take: 40,
      include: {
        student: { select: { fullName: true } },
        guardian: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="الأعذار الإلكترونية"
        subtitle={pending.length ? `${pending.length} عذر بانتظار المراجعة` : "لا طلبات معلّقة"}
        crumbs={[{ label: "الشؤون الأكاديمية" }, { label: "الأعذار" }]}
      />

      {pending.length === 0 ? (
        <EmptyState icon="attendance" title="لا أعذار معلّقة" hint="الأعذار التي يقدّمها أولياء الأمور تظهر هنا للبتّ فيها" />
      ) : (
        <ul className="space-y-3">
          {pending.map((e) => {
            const cls = e.student.enrollments[0]?.class;
            return (
              <li key={e.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800">{e.student.fullName}</span>
                    {cls && (
                      <Link href={`/admin/students/${cls.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                        {cls.displayName ?? cls.name}
                      </Link>
                    )}
                    <Badge tone="slate">{fmtDay(e.date)}</Badge>
                    <span className="ms-auto text-xs text-slate-400">
                      {e.guardian.user.name}
                      {e.guardian.user.phone && ` · ${e.guardian.user.phone}`}
                    </span>
                  </div>
                  <p className="mt-2 rounded-xl bg-amber-50/60 px-3 py-2 text-sm text-slate-700 ring-1 ring-amber-100">
                    {e.reason}
                  </p>
                  <FormWithResult action={decideExcuse} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <input name="note" placeholder="ملاحظة لولي الأمر (اختياري)" className={`${input} min-w-56 flex-1`} />
                    <button
                      name="decision" value="approved"
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                    >
                      اعتماد
                    </button>
                    <button
                      name="decision" value="rejected"
                      className="rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600 ring-1 ring-red-200 transition hover:bg-red-100"
                    >
                      رفض
                    </button>
                  </FormWithResult>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {decided.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-slate-500">السجل الأخير ({decided.length})</h2>
          <Card className="!p-0 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {decided.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-slate-700">{e.student.fullName}</span>
                  <span className="text-xs text-slate-400">{fmtDay(e.date)}</span>
                  <span className="text-xs text-slate-400">· {e.guardian.user.name}</span>
                  <span className="ms-auto flex items-center gap-2">
                    {e.note && <span className="max-w-40 truncate text-xs text-slate-400" title={e.note}>{e.note}</span>}
                    <Badge tone={e.status === "approved" ? "emerald" : "red"}>
                      {e.status === "approved" ? "مقبول" : "مرفوض"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

export const metadata = { title: "الأعذار الإلكترونية" };

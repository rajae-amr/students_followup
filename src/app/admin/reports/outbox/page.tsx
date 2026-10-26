import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import {
  retryOutboxEvent,
  cancelOutboxEvent,
  retryAllFailedAction,
} from "@/server/actions/reports";
import { ReportTabs } from "../report-tabs";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Icon } from "@/components/ui/icons";

const PAGE = 20;

const OUT_STATUS: Record<string, { label: string; tone: "slate" | "amber" | "emerald" | "red" }> = {
  pending: { label: "معلق", tone: "amber" },
  processing: { label: "قيد الإرسال", tone: "amber" },
  done: { label: "تم", tone: "emerald" },
  failed: { label: "فشل", tone: "red" },
  cancelled: { label: "ملغى", tone: "slate" },
};
const OUT_TYPE: Record<string, string> = {
  report_send: "تقرير",
  weekly_digest: "تلخيص أسبوعي",
  absence_alert: "تنبيه غياب",
  plan_notify: "إشعار خطة",
};

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** سجل الإرسال — طابور Outbox بكل الأحداث: الحالات والمحاولات والأخطاء */
export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ otype?: string; ostatus?: string; page?: string }>;
}) {
  await requirePerm("reports");
  const sp = await searchParams;
  const oType = sp.otype ?? "";
  const oStatus = sp.ostatus ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where = {
    ...(oType ? { type: oType } : {}),
    ...(oStatus ? { status: oStatus as never } : {}),
  };

  const [total, outbox] = await Promise.all([
    prisma.outboxEvent.count({ where }),
    prisma.outboxEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
  ]);
  const pages = Math.ceil(total / PAGE);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="سجل الإرسال" subtitle="طابور رسائل أولياء الأمور — الحالة والمحاولات وآخر خطأ لكل حدث" />
      <ReportTabs />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold text-slate-800">
            <Icon.bell className="h-5 w-5 text-violet-600" />
            الأحداث
            <Badge tone="brand">{total}</Badge>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex flex-wrap items-center gap-2">
              <select name="otype" defaultValue={oType} className={`${input} !py-1.5 text-xs`}>
                <option value="">كل الأنواع</option>
                {Object.entries(OUT_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select name="ostatus" defaultValue={oStatus} className={`${input} !py-1.5 text-xs`}>
                <option value="">كل الحالات</option>
                {Object.entries(OUT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">
                فلترة
              </button>
            </form>
            <FormWithResult
              action={retryAllFailedAction}
              submitLabel="↺ إعادة كل الفاشل"
              bare
              confirm="إعادة جدولة جميع أحداث الإرسال الفاشلة؟"
              buttonClass="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
            >
              <span />
            </FormWithResult>
          </div>
        </div>

        {outbox.length === 0 ? (
          <EmptyState icon="bell" title="لا أحداث إرسال مطابقة" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">النوع</th>
                  <th className="text-start font-semibold">القناة</th>
                  <th className="text-start font-semibold">الحالة</th>
                  <th className="text-center font-semibold">محاولات</th>
                  <th className="text-start font-semibold">آخر خطأ</th>
                  <th className="text-start font-semibold">أُنشئ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {outbox.map((e) => {
                  const st = OUT_STATUS[e.status] ?? { label: e.status, tone: "slate" as const };
                  const canRetry = e.status === "failed" || e.status === "pending";
                  return (
                    <tr key={e.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 font-medium text-slate-800">
                        {OUT_TYPE[e.type] ?? e.type}
                      </td>
                      <td>
                        <Badge tone={e.channel === "telegram" ? "brand" : "slate"}>
                          {e.channel === "telegram" ? "تيليجرام" : "البوابة"}
                        </Badge>
                      </td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="text-center text-slate-600">{e.attempts}</td>
                      <td className="max-w-[220px] truncate text-xs text-red-500" title={e.lastError ?? ""}>
                        {e.lastError ?? "—"}
                      </td>
                      <td className="text-xs text-slate-400">
                        {e.createdAt.toLocaleDateString("ar")}
                      </td>
                      <td>
                        {canRetry && (
                          <span className="flex items-center gap-2">
                            <FormWithResult action={retryOutboxEvent} submitLabel="إعادة" bare>
                              <input type="hidden" name="eventId" value={e.id} />
                            </FormWithResult>
                            <FormWithResult
                              action={cancelOutboxEvent}
                              submitLabel="إلغاء"
                              bare
                              buttonClass="text-xs font-semibold text-slate-400 hover:text-red-600"
                            >
                              <input type="hidden" name="eventId" value={e.id} />
                            </FormWithResult>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} params={{ otype: oType, ostatus: oStatus }} />
      </Card>
    </div>
  );
}

export const metadata = { title: "سجل الإرسال" };

import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { ReportGenerator } from "./report-generator";
import { SendReportButton } from "./send-button";
import { runWeeklyDigest } from "@/server/actions/admin";
import { retryOutboxEvent, cancelOutboxEvent } from "@/server/actions/reports";
import { FormWithResult } from "@/components/form-result";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const STATUS: Record<string, { label: string; tone: "slate" | "brand" | "emerald" | "red" }> = {
  draft: { label: "مسودة", tone: "slate" },
  approved: { label: "معتمد", tone: "brand" },
  sent: { label: "مُرسل", tone: "emerald" },
  failed: { label: "فشل", tone: "red" },
};
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
};

export default async function ReportsAdmin() {
  await requirePerm("reports");
  const [students, snapshots, outbox, viewCounts] = await Promise.all([
    prisma.student.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.reportSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { student: { select: { fullName: true } } },
    }),
    prisma.outboxEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.reportViewEvent.groupBy({
      by: ["reportSnapshotId"],
      _count: { reportSnapshotId: true },
    }),
  ]);
  const viewsBySnap = new Map(
    viewCounts.map((v) => [v.reportSnapshotId, v._count.reportSnapshotId]),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="التقارير المدرسية" subtitle="توليد تقارير الطلاب وإرسالها لأولياء الأمور" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <Icon.reports className="h-5 w-5 text-brand-600" />
            توليد تقرير طالب
          </h2>
          <ReportGenerator students={students.map((s) => ({ id: s.id, name: s.fullName }))} />
        </Card>

        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-800">
            <Icon.bell className="h-5 w-5 text-accent-600" />
            التلخيص الأسبوعي
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            يولّد تقريراً معتمداً لكل طالب ويرسل رسالة واحدة موحدة لكل ولي أمر تشمل جميع أبنائه.
            يتخطى بأمان إن لم يُهيأ التقويم.
          </p>
          <FormWithResult action={runWeeklyDigest} submitLabel="تشغيل الآن">
            <span />
          </FormWithResult>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          التقارير المعتمدة
          <Badge tone="brand">{snapshots.length}</Badge>
        </h2>
        {snapshots.length === 0 ? (
          <EmptyState icon="reports" title="لا تقارير بعد" hint="ولّد تقريراً من النموذج أعلاه" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-semibold">الطالب</th>
                  <th className="text-start font-semibold">الفترة</th>
                  <th className="text-start font-semibold">الحالة</th>
                  <th className="text-start font-semibold">أُنشئ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((r) => {
                  const st = STATUS[r.status] ?? { label: r.status, tone: "slate" as const };
                  return (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 font-medium text-slate-800">{r.student.fullName}</td>
                      <td dir="ltr" className="text-end text-xs text-slate-500">
                        {r.rangeStart.toISOString().slice(0, 10)} ← {r.rangeEnd.toISOString().slice(0, 10)}
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {r.status === "sent" && (viewsBySnap.get(r.id) ?? 0) > 0 && (
                            <Badge tone="slate">👁 قُرئ ×{viewsBySnap.get(r.id)}</Badge>
                          )}
                        </span>
                      </td>
                      <td className="text-xs text-slate-400">
                        {r.createdAt.toLocaleDateString("ar")}
                      </td>
                      <td>
                        {r.status === "approved" && <SendReportButton reportId={r.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* سجل الإرسال — كل أحداث الطابور وأخطاؤها مرئية هنا */}
      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.bell className="h-5 w-5 text-violet-600" />
          سجل الإرسال
          <Badge tone="brand">{outbox.length}</Badge>
        </h2>
        {outbox.length === 0 ? (
          <EmptyState icon="bell" title="لا أحداث إرسال بعد" />
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
      </Card>
    </div>
  );
}

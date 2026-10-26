import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import type { StudentReportContent } from "@app/core";
import {
  cancelSnapshotAction,
  deleteSnapshotAction,
} from "@/server/actions/reports";
import { SendReportButton } from "../send-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormWithResult } from "@/components/form-result";
import { ReportBody } from "@/components/report-body";
import { PrintTrigger } from "@/components/print-trigger";
import { Icon } from "@/components/ui/icons";

const STATUS: Record<string, { label: string; tone: "slate" | "brand" | "emerald" | "red" }> = {
  draft: { label: "مسودة", tone: "slate" },
  approved: { label: "معتمد", tone: "brand" },
  sent: { label: "مُرسل", tone: "emerald" },
  failed: { label: "فشل", tone: "red" },
  cancelled: { label: "ملغى", tone: "slate" },
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
  plan_notify: "إشعار خطة",
};

type DeliveryPayload = { guardianId?: string; telegramChatId?: string | null };

/** عرض لقطة تقرير للإدارة — المحتوى المجمّد + حالة التوصيل لكل ولي + سجل القراءات */
export default async function SnapshotView({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePerm("reports");
  const { id } = await params;

  const snap = await prisma.reportSnapshot.findUnique({
    where: { id },
    include: {
      student: { select: { fullName: true } },
      term: { select: { name: true } },
    },
  });
  if (!snap) notFound();

  const [events, views] = await Promise.all([
    prisma.outboxEvent.findMany({
      where: {
        OR: [
          { payload: { path: ["reportSnapshotId"], equals: id } },
          { payload: { path: ["reportSnapshotIds"], array_contains: id } },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.reportViewEvent.findMany({
      where: { reportSnapshotId: id },
      orderBy: { viewedAt: "desc" },
    }),
  ]);

  // أسماء أولياء الأمور المرتبطين بأحداث التوصيل + القراءات
  const guardianIds = [
    ...new Set(
      events
        .map((e) => (e.payload as DeliveryPayload).guardianId)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const viewerIds = [...new Set(views.map((v) => v.viewerUserId))];
  const [guardians, viewers] = await Promise.all([
    guardianIds.length
      ? prisma.guardianProfile.findMany({
          where: { id: { in: guardianIds } },
          include: { user: { select: { name: true } } },
        })
      : [],
    viewerIds.length
      ? prisma.user.findMany({ where: { id: { in: viewerIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const guardianName = new Map(guardians.map((g) => [g.id, g.user.name]));
  const viewerName = new Map(viewers.map((v) => [v.id, v.name]));

  const r = snap.contentJson as unknown as StudentReportContent;
  const st = STATUS[snap.status] ?? { label: snap.status, tone: "slate" as const };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`تقرير ${snap.student.fullName}`}
        subtitle={`الفترة ${snap.rangeStart.toISOString().slice(0, 10)} ← ${snap.rangeEnd.toISOString().slice(0, 10)}${snap.term ? ` · ${snap.term.name}` : ""}`}
        backHref="/admin/reports/snapshots"
        backLabel="لقطات التقارير"
      />

      {/* الحالة والإجراءات */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {snap.approvedAt && (
              <span className="text-xs text-slate-400">
                اعتُمد {snap.approvedAt.toLocaleDateString("ar")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {snap.status === "approved" && <SendReportButton reportId={snap.id} />}
            {snap.status === "approved" && (
              <FormWithResult
                action={cancelSnapshotAction}
                submitLabel="إلغاء اللقطة"
                bare
                confirm="إلغاء اللقطة يمنع إرسالها نهائياً — متابعة؟"
                buttonClass="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200"
              >
                <input type="hidden" name="snapshotId" value={snap.id} />
              </FormWithResult>
            )}
            {(snap.status === "draft" || snap.status === "cancelled") && (
              <FormWithResult
                action={deleteSnapshotAction}
                submitLabel="حذف نهائي"
                bare
                confirm="حذف اللقطة نهائياً؟ لا يمكن التراجع"
                buttonClass="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-100"
              >
                <input type="hidden" name="snapshotId" value={snap.id} />
              </FormWithResult>
            )}
            <PrintTrigger />
          </div>
        </div>
      </Card>

      {/* التوصيل لأولياء الأمور */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon.bell className="h-5 w-5 text-violet-600" />
          التوصيل
          <Badge tone="brand">{events.length}</Badge>
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">لم يُدرج إرسال بعد — {snap.status === "approved" ? "اضغط «إرسال لأولياء الأمور»" : "اعتمد التقرير أولاً"}.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {events.map((e) => {
              const p = e.payload as DeliveryPayload;
              const ost = OUT_STATUS[e.status] ?? { label: e.status, tone: "slate" as const };
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-32 font-medium text-slate-700">
                    {(p.guardianId && guardianName.get(p.guardianId)) ?? "—"}
                  </span>
                  <Badge tone="slate">{OUT_TYPE[e.type] ?? e.type}</Badge>
                  <Badge tone={e.channel === "telegram" ? "brand" : "slate"}>
                    {e.channel === "telegram" ? "تيليجرام" : "البوابة"}
                  </Badge>
                  <Badge tone={ost.tone}>{ost.label}</Badge>
                  {e.attempts > 1 && <span className="text-xs text-slate-400">×{e.attempts}</span>}
                  {e.lastError && (
                    <span className="max-w-56 truncate text-xs text-red-500" title={e.lastError}>
                      {e.lastError}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {views.length > 0 && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            قرأه: {views.map((v) => `${viewerName.get(v.viewerUserId) ?? "ولي أمر"} (${v.viewedAt.toLocaleDateString("ar")})`).join(" · ")}
          </p>
        )}
      </Card>

      {/* المحتوى المجمّد — نفس ما يراه ولي الأمر */}
      <div className="print-area">
        <ReportBody r={r} />
      </div>
    </div>
  );
}

export const metadata = { title: "لقطة تقرير" };

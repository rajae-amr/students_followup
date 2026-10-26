"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markNotificationRead } from "@/server/notify";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icons";
import type { NotificationDto } from "./page";

type Meta = { label: string; icon: IconName; cls: string; tone: "brand" | "amber" | "emerald" | "red" | "slate" };
const GENERAL: Meta = { label: "عام", icon: "bell", cls: "bg-brand-50 text-brand-600", tone: "slate" };
const TYPE_META: Record<string, Meta> = {
  absence_alert: { label: "غياب", icon: "bell", cls: "bg-red-50 text-red-500", tone: "red" },
  excuse_decision: { label: "عذر", icon: "attendance", cls: "bg-emerald-50 text-emerald-600", tone: "emerald" },
  plan_published: { label: "خطة", icon: "book", cls: "bg-brand-50 text-brand-600", tone: "brand" },
  announcement: { label: "إعلان", icon: "reports", cls: "bg-amber-50 text-amber-600", tone: "amber" },
};

/** صف إشعار — النقر يسجّل القراءة ثم ينتقل للرابط إن وُجد */
export function NotificationRow({ n }: { n: NotificationDto }) {
  const router = useRouter();
  const [, start] = useTransition();
  const m = TYPE_META[n.type] ?? GENERAL;
  const Ico = Icon[m.icon];

  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          if (!n.read) await markNotificationRead(n.id);
          router.push(n.href ?? "/notifications");
          router.refresh();
        })
      }
      className="block w-full text-start"
    >
      <Card className={`flex items-start gap-3 p-4 transition ${n.read ? "opacity-60" : "hover:shadow-lift hover:ring-brand-200"}`}>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${m.cls}`}>
          <Ico className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-800">{n.title}</span>
            <Badge tone={m.tone}>{m.label}</Badge>
            {!n.read && <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="غير مقروء" />}
          </span>
          {n.body && <span className="mt-1 block text-sm text-slate-600">{n.body}</span>}
          <span className="mt-1 block text-xs text-slate-400">{n.date}</span>
        </span>
      </Card>
    </button>
  );
}

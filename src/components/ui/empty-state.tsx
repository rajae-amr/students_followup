import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** حالة فارغة موحدة — أيقونة باهتة + رسالة + إجراء اختياري */
export function EmptyState({
  icon = "reports",
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  const I = Icon[icon];
  return (
    <div className="grid place-items-center rounded-2xl bg-white px-6 py-14 text-center shadow-soft ring-1 ring-slate-200/80">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-400">
        <I className="h-8 w-8" />
      </span>
      <p className="mt-4 font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

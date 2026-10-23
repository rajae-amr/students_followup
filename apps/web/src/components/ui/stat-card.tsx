import { Icon, type IconName } from "./icons";

/** بطاقة إحصائية — رقم كبير + عنوان + أيقونة ملوّنة */
export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  icon: IconName;
  tone?: "brand" | "accent" | "emerald" | "red" | "violet" | "amber" | "slate";
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700",
    accent: "bg-accent-50 text-accent-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-600",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  const I = Icon[icon];
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-100">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
        <I className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
        <p className="truncate text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

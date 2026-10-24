import Link from "next/link";
import { requirePerm } from "@/server/session";
import { prisma } from "@app/db";
import { weekStartOf, DAY_NAMES } from "@app/core";
import { PrintButton } from "./print-button";

const fmt = (d: Date) =>
  d.toLocaleDateString("ar-EG", { day: "numeric", month: "numeric", year: "numeric" });

/** كشف الإشراف الأسبوعي للطباعة — بنفس تخطيط الكشف الرسمي للمدرسة */
export default async function DutiesPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requirePerm("duties");
  const { week: weekParam } = await searchParams;
  const weekStart = weekParam ? weekStartOf(new Date(weekParam)) : weekStartOf(new Date());
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 4);

  const [settings, locations, duties] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "school" } }),
    prisma.dutyLocation.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.dutyAssignment.findMany({ where: { weekStart }, include: { teacher: { select: { name: true } } } }),
  ]);
  const weekDays = (settings?.weekDays ?? [1, 2, 3, 4, 5]).slice().sort();
  const at = new Map(duties.map((d) => [`${d.locationId}|${d.dayOfWeek}`, d] as const));
  const groups = [...new Set(locations.map((l) => l.group ?? "عام"))];
  const nameOf = (l: string, d: number) => {
    const x = at.get(`${l}|${d}`);
    return x ? (x.teacher?.name ?? x.label ?? "") : "";
  };

  // رقم الأسبوع من بداية العام الدراسي
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const weekNo = year
    ? Math.max(1, Math.floor((weekStart.getTime() - weekStartOf(year.startDate).getTime()) / 6048e5) + 1)
    : 1;
  const WEEK_ORD = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

  return (
    <div dir="rtl" className="print-area mx-auto max-w-[297mm] bg-white p-6 text-slate-900 print:p-2">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <PrintButton />
        <Link href={`/admin/duties?week=${weekStart.toISOString().slice(0, 10)}`} className="text-sm font-bold text-brand-600 hover:underline">
          ← رجوع للشبكة
        </Link>
      </div>

      {/* ترويسة الكشف الرسمية */}
      <header className="mb-3 text-center">
        <p className="text-lg font-bold">{settings?.schoolName ?? "مدرسة الجسر الحلقة الثانية بنين"}</p>
        <h1 className="mt-1 text-xl font-bold">
          جدول الإشراف اليومي للعام الدراسي {year?.name ?? ""}
        </h1>
        <p className="mt-1 text-sm font-semibold">
          الأسبوع {WEEK_ORD[weekNo] ?? weekNo} — {fmt(weekStart)} إلى {fmt(weekEnd)}
        </p>
      </header>

      {/* جدول المناوبات */}
      <table className="w-full border-collapse border border-slate-800 text-sm">
        <thead>
          <tr>
            <th className="border border-slate-800 bg-slate-100 p-1.5 text-xs">اليوم</th>
            {groups.map((g) =>
              locations
                .filter((l) => (l.group ?? "عام") === g)
                .map((l) => (
                  <th key={l.id} className="border border-slate-800 bg-slate-100 p-1.5 text-xs">
                    <span className="block text-[10px] font-normal text-slate-500">{g}</span>
                    {l.name}
                  </th>
                )),
            )}
          </tr>
        </thead>
        <tbody>
          {weekDays.map((d) => (
            <tr key={d}>
              <th className="border border-slate-800 bg-slate-50 p-1.5 text-xs font-bold">{DAY_NAMES[d]}</th>
              {locations.map((l) => (
                <td key={l.id} className="border border-slate-800 p-1 text-center text-xs font-semibold">
                  {nameOf(l.id, d) || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ملاحظات وتوقيع — كما في الكشف */}
      <footer className="mt-4 flex items-start justify-between text-xs">
        <ul className="space-y-1 font-semibold">
          <li>❑ أرجو الحضور المبكر للإشراف الصباحي خلال الساعة 6:45 صباحاً</li>
          <li>❑ إعطاء الإرشادات والتوجيهات المناسبة للطلبة وذلك للمحافظة على سلامتهم</li>
          <li>❑ يرجى الإشراف الإداري متابعة المشرفين لالتزامهم بالإشراف</li>
        </ul>
        <div className="text-center font-bold">
          <p>يعتمد،</p>
          <p className="mt-1">مدير المدرسة</p>
        </div>
      </footer>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: white; }
          .print-area { position: static !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

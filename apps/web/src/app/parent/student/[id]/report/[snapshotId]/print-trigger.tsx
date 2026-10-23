"use client";

export function PrintTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
    >
      🖨 طباعة التقرير
    </button>
  );
}

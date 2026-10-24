"use client";

export function PrintButton({ label = "🖨 طباعة" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

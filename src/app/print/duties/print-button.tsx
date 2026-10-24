"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden rounded-xl bg-slate-800 px-5 py-2 text-sm font-bold text-white hover:bg-slate-700"
    >
      🖨 طباعة / حفظ PDF
    </button>
  );
}

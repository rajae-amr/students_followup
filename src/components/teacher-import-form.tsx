"use client";

import { useState, useTransition } from "react";
import { importTeachers, type BulkAccountRow } from "@/server/actions/admin";
import { AccountSlips } from "./account-slips";

/** استيراد معلمين جماعي من قالب Excel — يعرض قسائم بيانات الدخول للطباعة */
export function TeacherImportForm({
  schoolName,
  siteUrl,
  botUsername,
}: {
  schoolName: string;
  siteUrl: string;
  botUsername: string;
}) {
  const [rows, setRows] = useState<BulkAccountRow[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await importTeachers(fd);
      if (!res.ok) { setError(res.error); return; }
      setRows(res.rows);
      setSkipped(res.skipped);
      setNotes(res.notes ?? []);
    });
  }

  if (rows) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3 print:hidden">
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            أُنشئ {rows.length} حساباً{skipped ? ` · تخطّي ${skipped}` : ""} — كلمات المرور تظهر هنا فقط
          </p>
          <button
            onClick={() => window.print()}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            🖨 طباعة القسائم
          </button>
          <button
            onClick={() => { setRows(null); setNotes([]); }}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600"
          >
            استيراد ملف آخر
          </button>
        </div>

        {notes.length > 0 && (
          <ul className="mb-3 list-inside list-disc space-y-0.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">
            {notes.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}
            {notes.length > 8 && <li>…و{notes.length - 8} ملاحظات أخرى</li>}
          </ul>
        )}

        <div className="overflow-x-auto print:hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.username}>
                <td className="py-1.5 font-medium text-slate-700">{r.names}</td>
                <td className="py-1.5 font-mono text-slate-600" dir="ltr">{r.username}</td>
                <td className="py-1.5 font-mono text-slate-600" dir="ltr">{r.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <AccountSlips
          rows={rows}
          schoolName={schoolName}
          siteUrl={siteUrl}
          botUsername={botUsername}
          audience="teacher"
        />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
      <input
        type="file" name="file" accept=".xlsx,.xls" required
        className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm file:ms-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-1.5 file:font-bold file:text-white"
      />
      <button
        disabled={pending} aria-busy={pending}
        className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "جارٍ الاستيراد…" : "⬆ استيراد الملف وإنشاء الحسابات"}
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <p className="text-xs leading-relaxed text-slate-400">
        لكل سطر يُنشأ حساب معلم بكلمة مرور أولية وتُطبع قسيمته — المكررون بأسمائهم يُتخطَّون.
      </p>
    </form>
  );
}

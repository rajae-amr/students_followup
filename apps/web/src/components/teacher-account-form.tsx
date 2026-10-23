"use client";

import { useState, useTransition } from "react";
import { createTeacherAccountAction, type BulkAccountRow } from "@/server/actions/admin";
import { AccountSlips } from "./account-slips";

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** إنشاء حساب معلم مباشر — يعرض قسيمة بيانات الدخول للطباعة */
export function TeacherAccountForm({
  subjects,
  schoolName,
  siteUrl,
  botUsername,
}: {
  subjects: string[];
  schoolName: string;
  siteUrl: string;
  botUsername: string;
}) {
  const [rows, setRows] = useState<BulkAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createTeacherAccountAction(fd);
      if (!res.ok) { setError(res.error); return; }
      setRows(res.rows);
    });
  }

  if (rows) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3 print:hidden">
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            أُنشئ حساب المعلم — كلمة المرور تظهر هنا فقط
          </p>
          <button
            onClick={() => window.print()}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            🖨 طباعة القسيمة
          </button>
          <button
            onClick={() => setRows(null)}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600"
          >
            إنشاء حساب آخر
          </button>
        </div>
        <table className="w-full text-sm print:hidden">
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
      <input name="name" placeholder="اسم المعلم" required className={input} />
      <div className="flex gap-2">
        <input name="phone" placeholder="هاتفه (لربط تيليجرام)" className={`${input} flex-1`} dir="ltr" />
        <select name="subject" className={`${input} w-32`} defaultValue="">
          <option value="">المادة…</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <button
        disabled={pending} aria-busy={pending}
        className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "جارٍ الإنشاء…" : "🔑 إنشاء حساب معلم"}
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <p className="text-xs leading-relaxed text-slate-400">
        يُنشأ الحساب فوراً بكلمة مرور أولية — تُطبع قسيمة تُسلَّم للمعلم، ويُلزَم بتغييرها عند أول دخول
      </p>
    </form>
  );
}

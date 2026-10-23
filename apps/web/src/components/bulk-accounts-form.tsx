"use client";

import { useState, useTransition } from "react";
import { createGuardianAccounts, type BulkAccountRow } from "@/server/actions/admin";
import { AccountSlips } from "./account-slips";

/**
 * إنشاء حسابات أولياء أمور صف — يعرض جدولاً على الشاشة
 * وقسائم توزيع قابلة للطباعة (بطاقة لكل ولي تُقص وتُسلّم للطالب).
 */
export function BulkAccountsForm({
  classId,
  schoolName,
  siteUrl,
  botUsername,
}: {
  classId: string;
  schoolName: string;
  siteUrl: string;
  botUsername: string;
}) {
  const [rows, setRows] = useState<BulkAccountRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("classId", classId);
      const res = await createGuardianAccounts(fd);
      if (!res.ok) { setError(res.error); return; }
      setRows(res.rows);
      setNote(
        res.skipped
          ? `أُنشئ/حُدّث ${res.rows.length} حساباً — ${res.skipped} طالباً مربوطون مسبقاً أو بلا رقم`
          : `أُنشئ/حُدّث ${res.rows.length} حساباً`,
      );
    });
  }

  if (!rows) {
    return (
      <div>
        <button
          onClick={run} disabled={pending} aria-busy={pending}
          className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-600 disabled:opacity-50"
        >
          {pending ? "جارٍ الإنشاء…" : "🔑 إنشاء حسابات أولياء أمور الصف"}
        </button>
        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 print:hidden">
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {note} — كلمات المرور تظهر هنا فقط
        </p>
        <button
          onClick={() => window.print()}
          className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          🖨 طباعة قسائم التوزيع
        </button>
        <button
          onClick={() => setRows(null)}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          إغلاق
        </button>
      </div>

      {/* عرض الشاشة */}
      <div className="overflow-x-auto print:hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-right text-xs text-slate-400">
              <th className="pb-2 font-semibold">الطالب/الأبناء</th>
              <th className="pb-2 font-semibold">اسم المستخدم</th>
              <th className="pb-2 font-semibold">كلمة المرور الأولية</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.username + r.names}>
                <td className="py-2 font-medium text-slate-700">{r.names}</td>
                <td className="py-2 font-mono text-slate-600" dir="ltr">{r.username}</td>
                <td className="py-2 font-mono text-slate-600" dir="ltr">
                  {r.password ?? <span className="font-sans text-xs text-slate-400">حساب قائم — رُبط الأبناء</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-400">
          يُطلب من ولي الأمر تغيير كلمة المرور عند أول دخول
        </p>
      </div>

      {/* قسائم التوزيع — تظهر في الطباعة فقط */}
      <AccountSlips
        rows={rows}
        schoolName={schoolName}
        siteUrl={siteUrl}
        botUsername={botUsername}
        audience="guardian"
      />
    </div>
  );
}

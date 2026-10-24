"use client";

import { useState, useTransition } from "react";
import {
  createStudentGuardianAccount,
  type BulkAccountRow,
} from "@/server/actions/admin";
import { AccountSlips } from "./account-slips";

/**
 * إنشاء حساب ولي أمر فردي من ملف الطالب — يعرض بيانات الدخول
 * مرة واحدة مع قسيمة طباعة للتسليم للطالب.
 */
export function GuardianAccountForm({
  studentId,
  defaultName,
  defaultPhone,
  schoolName,
  siteUrl,
  botUsername,
}: {
  studentId: string;
  defaultName: string;
  defaultPhone: string;
  schoolName: string;
  siteUrl: string;
  botUsername: string;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [rows, setRows] = useState<BulkAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const input =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  function run() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("studentId", studentId);
      fd.set("displayName", name);
      fd.set("phone", phone);
      const res = await createStudentGuardianAccount(fd);
      if (!res.ok) { setError(res.error); return; }
      setRows(res.rows);
    });
  }

  if (rows) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3 print:hidden">
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            أُنشئ/رُبط الحساب — بيانات الدخول تظهر هنا فقط
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
            إغلاق
          </button>
        </div>
        <div className="overflow-x-auto print:hidden">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.username} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-700">{r.names}</td>
                  <td className="py-2 font-mono text-slate-600" dir="ltr">{r.username}</td>
                  <td className="py-2 font-mono text-slate-600" dir="ltr">
                    {r.password ?? <span className="font-sans text-xs text-slate-400">حساب قائم — رُبط الطالب</span>}
                  </td>
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
          audience="guardian"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium text-slate-500">
        اسم ولي الأمر
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${input} mt-1 block w-44`}
          placeholder="ولي أمر الطالب"
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        الهاتف
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
          className={`${input} mt-1 block w-36`}
          placeholder="05xxxxxxxx"
        />
      </label>
      <button
        onClick={run}
        disabled={pending || !phone.trim()}
        aria-busy={pending}
        className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-600 disabled:opacity-50"
      >
        {pending ? "جارٍ الإنشاء…" : "🔑 إنشاء حساب"}
      </button>
      {error && (
        <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}

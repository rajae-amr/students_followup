"use client";

import { useState, useTransition } from "react";
import { bulkGenerateReportsAction } from "@/server/actions/reports";

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** توليد جماعي للتقارير — صف/مستوى/كل المدرسة لمدى أو فصل، مع إرسال اختياري */
export function BulkGenerate({
  classes,
  grades,
  terms,
}: {
  classes: { id: string; name: string }[];
  grades: { id: string; name: string }[];
  terms: { id: string; name: string }[];
}) {
  const [scope, setScope] = useState<"class" | "grade" | "all">("class");
  const [mode, setMode] = useState<"term" | "range">("range");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      action={(fd) =>
        startTransition(async () => {
          fd.set("scope", scope);
          const res = await bulkGenerateReportsAction(fd);
          setResult({ ok: res.ok, text: res.ok ? (res.message ?? "تم") : (res.error ?? "فشل") });
        })
      }
    >
      <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={input}>
        <option value="class">صف</option>
        <option value="grade">مستوى</option>
        <option value="all">كل المدرسة</option>
      </select>
      {scope === "class" && (
        <select name="classId" required className={input} defaultValue="">
          <option value="" disabled>الصف…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {scope === "grade" && (
        <select name="gradeId" required className={input} defaultValue="">
          <option value="" disabled>المستوى…</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}

      <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className={input}>
        <option value="range">مدى يدوي</option>
        {terms.length > 0 && <option value="term">فصل دراسي</option>}
      </select>
      {mode === "term" ? (
        <select name="termId" required className={input} defaultValue="">
          <option value="" disabled>الفصل…</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      ) : (
        <>
          <input type="date" name="rangeStart" required className={input} />
          <input type="date" name="rangeEnd" required className={input} />
        </>
      )}

      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
        <input type="checkbox" name="send" value="1" className="h-4 w-4 rounded border-slate-300 text-brand-600" />
        إرسال فوري
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "…" : "توليد"}
      </button>

      {result && (
        <p className={`w-full rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {result.text}
        </p>
      )}
    </form>
  );
}

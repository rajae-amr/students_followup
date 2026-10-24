"use client";

import { useState, useTransition } from "react";

type DayDef = { index: number; label: string; isBreak: boolean };
export type GridDay = { dayOfWeek: number; name: string; defs: DayDef[] };

type Result = { ok: boolean; message?: string; error?: string };

/**
 * شبكة أيام×خانات قابلة للنقر — لتحرير خانات محظورة (توفر معلم / حظر مادة).
 * يحفظ دفعة واحدة عبر server action يستقبل keys JSON.
 */
export function SlotGridEditor({
  days,
  initialKeys,
  entityField,
  entityId,
  action,
}: {
  days: GridDay[];
  initialKeys: string[]; // "day-index" للخانات المحظورة حالياً
  entityField: string;   // "teacherId" | "subjectId"
  entityId: string;
  action: (fd: FormData) => Promise<Result>;
}) {
  const [blocked, setBlocked] = useState<Set<string>>(new Set(initialKeys));
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: string) => {
    setBlocked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const save = () => {
    const fd = new FormData();
    fd.set(entityField, entityId);
    fd.set("keys", JSON.stringify(
      [...blocked].map((k) => {
        const [d, i] = k.split("-").map(Number);
        return { dayOfWeek: d, periodIndex: i };
      }),
    ));
    startTransition(async () => setResult(await action(fd)));
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-center text-xs">
          <thead>
            <tr>
              {days.map((d) => (
                <th key={d.dayOfWeek} className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-600">
                  {d.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(...days.map((d) => d.defs.length)) }).map((_, row) => (
              <tr key={row}>
                {days.map((d) => {
                  const def = d.defs[row];
                  if (!def) return <td key={d.dayOfWeek} />;
                  if (def.isBreak) {
                    return (
                      <td key={d.dayOfWeek}
                          className="rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-300">
                        {def.label}
                      </td>
                    );
                  }
                  const key = `${d.dayOfWeek}-${def.index}`;
                  const isBlocked = blocked.has(key);
                  return (
                    <td key={d.dayOfWeek}>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        className={`w-full rounded-lg px-2 py-1.5 font-semibold transition ${
                          isBlocked
                            ? "bg-red-100 text-red-700 ring-1 ring-red-300"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {def.label}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : "حفظ الخانات المحظورة"}
        </button>
        <span className="text-xs text-slate-400">
          الأحمر = محظور — {blocked.size} خانة
        </span>
      </div>
      {result && (
        <p className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {result.ok ? (result.message ?? "تم") : result.error}
        </p>
      )}
    </div>
  );
}

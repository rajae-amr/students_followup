"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { startGenerationAction } from "@/server/actions/timetable";

type JobState = {
  status: string;
  log: string[];
  error: string | null;
  timetableId: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "بالانتظار…",
  RUNNING: "الحل جارٍ…",
  DONE: "اكتمل ✓",
  FAILED: "فشل",
  INFEASIBLE: "غير قابل للحل بالقيود الحالية",
};

/** يبدأ مهمة توليد ويستطلع حالتها حتى تنتهي ثم يحدّث الصفحة */
export function GenerateButton() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<JobState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const poll = (id: string) => {
    stop();
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) return;
        const data = (await res.json()) as JobState;
        setState(data);
        if (["DONE", "FAILED", "INFEASIBLE"].includes(data.status)) {
          stop();
          router.refresh();
        }
      } catch { /* تجاهل أخطاء الشبكة المؤقتة */ }
    };
    void tick();
    timer.current = setInterval(tick, 2500);
  };

  const start = () => {
    setStartError(null);
    setState(null);
    startTransition(async () => {
      const res = await startGenerationAction();
      if (!res.ok) { setStartError(res.error); return; }
      const id = res.message!;
      setJobId(id);
      poll(id);
    });
  };

  const busy = pending || (state && ["PENDING", "RUNNING"].includes(state.status));

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={!!busy}
        className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "⏳ التوليد جارٍ…" : "⚙️ توليد جدول جديد"}
      </button>
      {startError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{startError}</p>}
      {jobId && state && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="mb-1 font-bold text-slate-700">
            الحالة: {STATUS_LABEL[state.status] ?? state.status}
            {state.error && <span className="text-red-600"> — {state.error}</span>}
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-slate-500" dir="auto">
            {state.log.map((l, i) => <li key={i}>• {l}</li>)}
          </ul>
          {state.status === "DONE" && state.timetableId && (
            <a href={`/admin/timetable/${state.timetableId}`}
               className="mt-2 inline-block font-bold text-brand-600 hover:underline">
              مراجعة المسودة ←
            </a>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { sendReport } from "@/server/actions/reports";

export function SendReportButton({ reportId }: { reportId: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await sendReport(reportId);
            setResult(
              res.ok
                ? `أُرسل للطابور (${res.queued ?? 0})`
                : (res.error ?? "فشل"),
            );
          })
        }
        className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
      >
        إرسال لأولياء الأمور
      </button>
      {result && <span className="text-xs text-slate-500">{result}</span>}
    </span>
  );
}

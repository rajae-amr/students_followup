"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { openSession } from "@/server/actions/attendance";

export function OpenSessionButton({
  slotId,
  dateISO,
  sessionId,
}: {
  slotId: string;
  dateISO: string;
  sessionId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      disabled={pending}
      onClick={async () => {
        if (sessionId) {
          router.push(`/teacher/session/${sessionId}`);
          return;
        }
        setPending(true);
        const res = await openSession(slotId, dateISO);
        setPending(false);
        if (res && !res.ok) alert(res.error);
      }}
      className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
    >
      {pending ? "..." : sessionId ? "متابعة الرصد" : "فتح الكشف"}
    </button>
  );
}

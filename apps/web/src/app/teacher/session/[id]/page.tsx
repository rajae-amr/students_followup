import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/server/session";
import { sessionRoster } from "@app/core";
import { RosterClient } from "./roster-client";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole("teacher", "admin");
  const { id } = await params;

  let roster;
  try {
    roster = await sessionRoster(actor, id);
  } catch {
    notFound();
  }

  const marked = roster.students.filter((s) => s.status !== null).length;
  const s = roster.session;
  const done = s.status === "submitted";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/teacher"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <Icon.arrowBack className="h-4 w-4" />
        حصصي
      </Link>

      <PageHeader
        title={`${s.subjectName} — الحصة ${s.period}`}
        subtitle={s.className}
        actions={
          done ? (
            <Badge tone="emerald"><Icon.check className="h-3.5 w-3.5" /> معتمدة</Badge>
          ) : s.status === "cancelled" ? (
            <Badge tone="slate">ملغاة</Badge>
          ) : (
            <Badge tone="amber">قيد الرصد</Badge>
          )
        }
      />

      <RosterClient
        sessionId={s.id}
        sessionStatus={s.status}
        dateISO={s.date.toISOString()}
        students={roster.students}
        markedCount={marked}
      />
    </div>
  );
}

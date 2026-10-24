import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { requireRole } from "@/server/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const job = await prisma.timetableJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    status: job.status,
    log: job.logJson ? (JSON.parse(job.logJson) as string[]) : [],
    diagnostics: job.diagnosticsJson ? JSON.parse(job.diagnosticsJson) : [],
    error: job.error,
    timetableId: job.timetableId,
    finishedAt: job.finishedAt,
  });
}

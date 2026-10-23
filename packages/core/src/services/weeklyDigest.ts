/**
 * التلخيص الأسبوعي — يولّد لقطات تقارير معتمدة لكل طالب له أولياء أمور
 * موثقون، ثم يدرج لكل ولي أمر حدث outbox واحداً يشمل كل أبنائه
 * (رسالة موحدة لكل محادثة — مطابق لسلوك النظام القديم).
 *
 * يُستدعى من مهمة العامل المجدولة ومن زر الإدارة اليدوي.
 * idempotent: لقطة موجودة لنفس النطاق تُعاد استخدامها، ومفاتيح outbox فريدة.
 */

import { prisma } from "@app/db";
import { buildStudentReport } from "./reports";
import { schoolToday, schoolTimezone } from "./time";
import type { Actor } from "../permissions";

const SYSTEM_ACTOR: Actor = { userId: "system", role: "admin", isActive: true };

export interface WeeklyDigestResult {
  rangeStart: string;
  rangeEnd: string;
  students: number;
  guardians: number;
  queued: number;
  skippedNoCalendar: boolean;
}

/** التقويم مهيأ إن وُجد فصل واحد أو يوم مسجل — شرط تشغيل الإرسال الآلي */
export async function calendarConfigured(): Promise<boolean> {
  const [terms, days] = await Promise.all([
    prisma.term.count(),
    prisma.calendarDay.count(),
  ]);
  return terms > 0 || days > 0;
}

export async function generateWeeklyDigests(input?: {
  requireCalendar?: boolean;
  rangeDays?: number;
}): Promise<WeeklyDigestResult> {
  const requireCalendar = input?.requireCalendar ?? true;
  if (requireCalendar && !(await calendarConfigured())) {
    return {
      rangeStart: "", rangeEnd: "", students: 0,
      guardians: 0, queued: 0, skippedNoCalendar: true,
    };
  }

  const rangeEnd = schoolToday(await schoolTimezone());
  const rangeStart = new Date(rangeEnd);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (input?.rangeDays ?? 7));
  const rs = rangeStart.toISOString().slice(0, 10);
  const re = rangeEnd.toISOString().slice(0, 10);

  // طلاب نشطون لهم أولياء أمور موثقون
  const links = await prisma.guardianStudent.findMany({
    where: { verified: true, student: { isActive: true } },
    include: {
      student: { select: { id: true } },
      guardian: {
        include: { user: { select: { telegramChatId: true, isActive: true } } },
      },
    },
  });
  if (!links.length)
    return { rangeStart: rs, rangeEnd: re, students: 0, guardians: 0, queued: 0, skippedNoCalendar: false };

  // لقطة معتمدة لكل طالب (تُعاد استخدامها إن وُجدت لنفس النطاق)
  const studentIds = [...new Set(links.map((l) => l.student.id))];
  const snapshotByStudent = new Map<string, string>();
  for (const studentId of studentIds) {
    const existing = await prisma.reportSnapshot.findFirst({
      where: {
        studentId,
        rangeStart, rangeEnd,
        status: { in: ["approved", "sent"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      snapshotByStudent.set(studentId, existing.id);
      continue;
    }
    const content = await buildStudentReport(SYSTEM_ACTOR, {
      studentId, rangeStart, rangeEnd,
    });
    const snap = await prisma.reportSnapshot.create({
      data: {
        studentId,
        rangeStart, rangeEnd,
        contentJson: content as never,
        status: "approved",
        approvedById: SYSTEM_ACTOR.userId,
        approvedAt: new Date(),
      },
    });
    snapshotByStudent.set(studentId, snap.id);
  }

  // تجميع لقطات أبناء كل ولي أمر — حدث واحد يشملهم جميعاً
  const byGuardian = new Map<string, {
    chatId: string | null;
    isActive: boolean;
    snapshotIds: Set<string>;
  }>();
  for (const l of links) {
    const snapId = snapshotByStudent.get(l.student.id);
    if (!snapId) continue;
    const g = byGuardian.get(l.guardianId) ?? {
      chatId: l.guardian.user.telegramChatId,
      isActive: l.guardian.user.isActive,
      snapshotIds: new Set(),
    };
    g.snapshotIds.add(snapId);
    byGuardian.set(l.guardianId, g);
  }

  let queued = 0;
  for (const [guardianId, g] of byGuardian) {
    if (!g.isActive) continue;
    const channel = g.chatId ? "telegram" : "portal";
    const key = `weekly:${rs}:${re}:g:${guardianId}`;
    await prisma.outboxEvent.upsert({
      where: { idempotencyKey: key },
      create: {
        type: "weekly_digest",
        channel,
        idempotencyKey: key,
        payload: {
          guardianId,
          telegramChatId: g.chatId,
          reportSnapshotIds: [...g.snapshotIds],
          rangeStart: rs,
          rangeEnd: re,
        },
      },
      update: {},
    });
    queued++;
  }

  return {
    rangeStart: rs, rangeEnd: re,
    students: snapshotByStudent.size,
    guardians: byGuardian.size,
    queued,
    skippedNoCalendar: false,
  };
}

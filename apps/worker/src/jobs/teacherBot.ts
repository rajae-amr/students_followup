/**
 * تدفق المعلم داخل بوت تيليجرام — يكافئ bot.py القديم:
 * - «حضور»: حصص اليوم المسندة → كيبورد كشف بأسماء الطلاب، كل ضغطة تدوّر
 *   الحالة وتكتب فوراً عبر recordAttendance (التحقق من الإسناد في الخدمة).
 * - «سلوك»: نفس الكشف للسلوك — كل ضغطة تستبدل قيمة الطالب لهذه الحصة.
 * - «💾»: ملخص الحالات + زر اعتماد الحصة.
 * - اسم طالب: تقرير معاينة + زر تقييم متعدد الخطوات (telegramState).
 * كل callback_data ضمن حدّ تيليجرام 64 بايت.
 */

import { prisma } from "@app/db";
import {
  lessonsForTeacher,
  ensureSession,
  recordAttendance,
  submitSession,
  sessionRoster,
  recordBehavior,
  setEvaluation,
  weekStartOf,
  WEEKLY_EVAL_OPTIONS,
  buildStudentReport,
  LESSON_STATUS_AR,
  BEHAVIOR_AR,
  schoolToday,
  schoolTimezone,
} from "@app/core";
import type { Actor } from "@app/core";
import type { LessonAttendance } from "@app/core";
import type { BehaviorCategory } from "@app/core";
import { botApi, renderReportText, splitMessage } from "../telegram";

type Api = ReturnType<typeof botApi>;

interface Btn { text: string; callback_data: string }
type Markup = { inline_keyboard: Btn[][] };

const ATT_CYCLE: LessonAttendance[] = ["present", "absent", "late", "excused"];
const ATT_EMOJI: Record<LessonAttendance, string> = {
  present: "✅", absent: "❌", late: "⏰", excused: "🟡",
};
const NO_MARK = "⚪";
const BEH_CYCLE: BehaviorCategory[] = ["committed", "excellent", "needs_followup"];
const BEH_EMOJI: Record<BehaviorCategory, string> = {
  committed: "🟢", excellent: "🌟", needs_followup: "⚠️",
};

const ATT_TRIGGERS = new Set(["حضور", "الحضور", "غياب", "الغياب", "دوام", "الدوام"]);
const BEH_TRIGGERS = new Set(["سلوك", "السلوك"]);

// خيارات معالج التقييم — مطابقة لفئات صفحة الويب (النظام القديم)
const EV_STEPS = [
  { key: "part", category: "المشاركة", label: "المشاركة", options: WEEKLY_EVAL_OPTIONS["المشاركة"] },
  { key: "alef", category: "كتاب أ", label: "مهام ألف", options: WEEKLY_EVAL_OPTIONS["كتاب أ"] },
  { key: "books", category: "الكتب", label: "الحضور والكتب", options: WEEKLY_EVAL_OPTIONS["الكتب"] },
] as const;

interface EvState {
  studentId: string;
  subjectId: string;
  values: Record<string, string>;
}
type TgState = { ev?: EvState | undefined } | null;

export interface TgTeacher {
  id: string;
  name: string;
  role: string;
  telegramState: unknown;
}

export async function teacherByChat(chatId: number): Promise<TgTeacher | null> {
  return prisma.user.findFirst({
    where: {
      telegramChatId: String(chatId),
      isActive: true,
      role: { in: ["teacher", "admin"] },
    },
    select: { id: true, name: true, role: true, telegramState: true },
  });
}

const actorOf = (t: TgTeacher): Actor => ({
  userId: t.id,
  role: t.role as Actor["role"],
  isActive: true,
});

async function setState(userId: string, patch: Partial<NonNullable<TgState>>) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramState: true } });
  const cur = (u?.telegramState ?? {}) as Record<string, unknown>;
  const next = { ...cur, ...patch } as Record<string, unknown>;
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  await prisma.user.update({
    where: { id: userId },
    data: { telegramState: next as never },
  });
}

// ---------- كيبوردات ----------

function lessonsKb(lessons: { slotId: string; period: number; className: string; subjectName: string; sessionStatus: string | null }[], prefix: "ta" | "tb"): Markup {
  return {
    inline_keyboard: lessons.map((l) => [{
      text: `${l.sessionStatus === "submitted" ? "🔒 " : ""}حصة ${l.period} — ${l.className} — ${l.subjectName}`,
      callback_data: `${prefix}:${l.slotId}`,
    }]),
  };
}

function rosterKb(
  sessionId: string,
  students: { studentId: string; fullName: string; mark: string }[],
  tapPrefix: "mk" | "bk",
  savePrefix: "sv" | "bv",
): Markup {
  const rows: Btn[][] = students.map((s) => [{
    text: `${s.mark} ${s.fullName}`,
    callback_data: `${tapPrefix}:${sessionId}:${s.studentId}`,
  }]);
  rows.push([{ text: "💾 حفظ الكل", callback_data: `${savePrefix}:${sessionId}` }]);
  return { inline_keyboard: rows };
}

function rosterHeader(className: string, subject: string, period: number, icon: string) {
  return `${icon} «${className}» — ${subject} — حصة ${period}`;
}

async function attendanceKb(api: Api, actor: Actor, chatId: number, sessionId: string): Promise<void> {
  const roster = await sessionRoster(actor, sessionId);
  const kb = rosterKb(
    sessionId,
    roster.students.map((s) => ({
      studentId: s.studentId,
      fullName: s.fullName,
      mark: s.status ? ATT_EMOJI[s.status] : NO_MARK,
    })),
    "mk", "sv",
  );
  await api.sendMessage(
    chatId,
    `${rosterHeader(roster.session.className, roster.session.subjectName, roster.session.period, "📋 حضور")}\n` +
    "كل زر يدور حالة الطالب عند الضغط. «💾 حفظ الكل» عند الانتهاء.",
    { reply_markup: kb },
  );
}

async function behaviorKb(api: Api, actor: Actor, chatId: number, sessionId: string): Promise<void> {
  const roster = await sessionRoster(actor, sessionId);
  const entries = await prisma.behaviorEntry.findMany({
    where: { lessonSessionId: sessionId, teacherId: actor.userId, category: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  const current = new Map<string, BehaviorCategory>();
  for (const e of entries) current.set(e.studentId, e.category as BehaviorCategory);

  const kb = rosterKb(
    sessionId,
    roster.students.map((s) => ({
      studentId: s.studentId,
      fullName: s.fullName,
      mark: current.has(s.studentId) ? BEH_EMOJI[current.get(s.studentId)!] : NO_MARK,
    })),
    "bk", "bv",
  );
  await api.sendMessage(
    chatId,
    `${rosterHeader(roster.session.className, roster.session.subjectName, roster.session.period, "🗒️ سلوك")}\n` +
    "كل زر يدور سلوك الطالب (ملتزم → ممتاز → يحتاج متابعة). «💾» للملخص.",
    { reply_markup: kb },
  );
}

// ---------- نصوص المعلم ----------

export async function handleTeacherText(t: TgTeacher, chatId: number, text: string): Promise<void> {
  const api = botApi();
  const actor = actorOf(t);
  const state = (t.telegramState ?? null) as TgState;

  if (ATT_TRIGGERS.has(text) || BEH_TRIGGERS.has(text)) {
    const kind = ATT_TRIGGERS.has(text) ? "att" : "beh";
    const lessons = await lessonsForTeacher(actor, schoolToday(await schoolTimezone()));
    const open = lessons.filter((l) => l.sessionStatus !== "submitted");
    if (!open.length) {
      await api.sendMessage(chatId, "لا حصص مسندة لك اليوم (أو كلها معتمدة).");
      return;
    }
    await api.sendMessage(
      chatId,
      `اختر الحصة لتسجيل ${kind === "att" ? "الحضور" : "السلوك"}:`,
      { reply_markup: lessonsKb(open, kind === "att" ? "ta" : "tb") },
    );
    return;
  }

  // بحث باسم طالب ضمن نطاق تدريسه → تقرير معاينة
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!year) return;
  const q = text.trim().replace(/\s+/g, " ");
  const found = await prisma.enrollment.findMany({
    where: {
      academicYearId: year.id,
      student: { isActive: true, fullName: { contains: q } },
      class: { assignments: { some: { teacherId: t.id, isActive: true } } },
    },
    include: { student: { select: { id: true, fullName: true } }, class: { select: { displayName: true } } },
    take: 16,
  });
  const uniq = [...new Map(found.map((f) => [f.student.id, f])).values()];
  if (!uniq.length) {
    await api.sendMessage(chatId, `لم أجد طالباً باسم «${q}» ضمن صفوفك — جرّب جزءاً من الاسم.`);
    return;
  }
  if (uniq.length === 1) {
    await sendTeacherReport(api, actor, chatId, uniq[0]!.student.id);
    return;
  }
  await api.sendMessage(
    chatId,
    `وجدت ${uniq.length} طلاباً — اختر المقصود:`,
    {
      reply_markup: {
        inline_keyboard: uniq.slice(0, 8).map((f) => [{
          text: `${f.student.fullName} — ${f.class.displayName}`,
          callback_data: `st:${f.student.id}`,
        }]),
      },
    },
  );
}

async function sendTeacherReport(api: Api, actor: Actor, chatId: number, studentId: string) {
  try {
    const rangeEnd = schoolToday(await schoolTimezone());
    const rangeStart = new Date(rangeEnd);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);
    const content = await buildStudentReport(actor, { studentId, rangeStart, rangeEnd });
    const settings = await prisma.schoolSettings.findUnique({ where: { id: "school" } });
    const text = renderReportText(content, settings?.schoolName ?? "المدرسة");
    const parts = splitMessage(text);
    for (let i = 0; i < parts.length; i++) {
      await api.sendMessage(chatId, parts[i]!, i === parts.length - 1
        ? { reply_markup: { inline_keyboard: [[{ text: "⭐ تقييم الطالب", callback_data: `em:${studentId}` }]] } }
        : {});
    }
  } catch {
    await api.sendMessage(chatId, "هذا الطالب خارج نطاق تدريسك.");
  }
}

// ---------- callbacks ----------

export async function handleTeacherCallback(
  t: TgTeacher,
  cq: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } },
): Promise<void> {
  const api = botApi();
  const actor = actorOf(t);
  const data = cq.data ?? "";
  const chatId = cq.message!.chat.id;
  const msgId = cq.message!.message_id;
  const parts = data.split(":");
  const kind = parts[0];
  await api.answerCallbackQuery(cq.id);

  try {
    // فتح كشف حضور/سلوك من خانة مجدولة
    if (kind === "ta" || kind === "tb") {
      const session = await ensureSession(actor, parts[1]!, schoolToday(await schoolTimezone()));
      if (kind === "ta") await attendanceKb(api, actor, chatId, session.id);
      else await behaviorKb(api, actor, chatId, session.id);
      return;
    }
    // كشف سلوك لحصة قائمة
    if (kind === "bh") {
      await behaviorKb(api, actor, chatId, parts[1]!);
      return;
    }

    // تدوير حالة طالب — كتابة مباشرة ثم إعادة رسم الكيبورد
    if (kind === "mk" || kind === "bk") {
      const sessionId = parts[1]!, studentId = parts[2]!;
      if (kind === "mk") {
        const cur = await prisma.attendanceEntry.findUnique({
          where: { lessonSessionId_studentId: { lessonSessionId: sessionId, studentId } },
        });
        const next = ATT_CYCLE[(ATT_CYCLE.indexOf(cur?.status as LessonAttendance) + 1) % ATT_CYCLE.length]!;
        await recordAttendance(actor, { sessionId, studentId, status: next });
        await refreshAttendanceKb(api, actor, chatId, msgId, sessionId);
      } else {
        const entries = await prisma.behaviorEntry.findMany({
          where: { lessonSessionId: sessionId, studentId, teacherId: actor.userId, category: { not: null } },
          orderBy: { createdAt: "desc" },
        });
        const cur = entries[0]?.category as BehaviorCategory | undefined;
        const next = BEH_CYCLE[(BEH_CYCLE.indexOf(cur as BehaviorCategory) + 1) % BEH_CYCLE.length]!;
        // استبدال قيمة الطالب لهذه الحصة بدل تراكم سجلات لكل ضغطة
        await prisma.behaviorEntry.deleteMany({
          where: { lessonSessionId: sessionId, studentId, teacherId: actor.userId },
        });
        await recordBehavior(actor, { studentId, date: schoolToday(await schoolTimezone()), category: next, lessonSessionId: sessionId, audience: "family" });
        await refreshBehaviorKb(api, actor, chatId, msgId, sessionId);
      }
      return;
    }

    // ملخص الحفظ
    if (kind === "sv") {
      const sessionId = parts[1]!;
      const roster = await sessionRoster(actor, sessionId);
      const counts = new Map<LessonAttendance, number>();
      let unmarked = 0;
      for (const s of roster.students) {
        if (!s.status) unmarked++;
        else counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
      }
      const summary = [...counts.entries()]
        .map(([k, v]) => `${ATT_EMOJI[k]} ${LESSON_STATUS_AR[k]}: ${v}`).join("  |  ");
      await api.sendMessage(
        chatId,
        `✅ حُفظ حضور «${roster.session.className}» — حصة ${roster.session.period}\n${summary}` +
        (unmarked ? `\n${NO_MARK} بلا رصد: ${unmarked}` : ""),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔏 اعتماد الحصة", callback_data: `sm:${sessionId}` }],
              [{ text: "🗒️ سلوك نفس الحصة", callback_data: `bh:${sessionId}` }],
            ],
          },
        },
      );
      return;
    }

    if (kind === "bv") {
      const sessionId = parts[1]!;
      const entries = await prisma.behaviorEntry.findMany({
        where: { lessonSessionId: sessionId, teacherId: actor.userId, category: { not: null } },
        orderBy: { createdAt: "asc" },
      });
      const current = new Map<string, BehaviorCategory>();
      for (const e of entries) current.set(e.studentId, e.category as BehaviorCategory);
      const counts = new Map<BehaviorCategory, number>();
      for (const v of current.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
      const summary = [...counts.entries()]
        .map(([k, v]) => `${BEH_EMOJI[k]} ${BEHAVIOR_AR[k]}: ${v}`).join("  |  ");
      await api.sendMessage(chatId, `✅ حُفظ سلوك الحصة\n${summary || "— لا سجلات —"}`);
      return;
    }

    // اعتماد الحصة
    if (kind === "sm") {
      await submitSession(actor, parts[1]!);
      await api.sendMessage(chatId, "🔏 اعتُمدت الحصة — التعديل لاحقاً يتطلب إعادة فتح من الإدارة.");
      return;
    }

    // تقرير طالب للمعلم
    if (kind === "st") {
      await sendTeacherReport(api, actor, chatId, parts[1]!);
      return;
    }

    // معالج التقييم
    if (kind === "em") {
      await startEvaluation(api, actor, t, chatId, parts[1]!);
      return;
    }
    if (kind === "es") {
      const st = (t.telegramState as TgState)?.ev!;
      await setState(t.id, { ev: { ...st, subjectId: parts[2]!, values: {} } });
      await evalStep(api, chatId, { ...st, subjectId: parts[2]!, values: {} }, 0);
      return;
    }
    if (kind === "ep" || kind === "ea" || kind === "eb") {
      const stepIdx = kind === "ep" ? 0 : kind === "ea" ? 1 : 2;
      const st = (t.telegramState as TgState)?.ev;
      if (!st) { await api.sendMessage(chatId, "انتهت الجلسة — أعد فتح التقييم."); return; }
      const step = EV_STEPS[stepIdx]!;
      st.values[step.category] = step.options[Number(parts[1])] ?? step.options[0]!;
      await setState(t.id, { ev: st });
      if (stepIdx < 2) await evalStep(api, chatId, st, stepIdx + 1);
      else await finishEvaluation(api, actor, t.id, chatId, st);
      return;
    }
    if (kind === "el") {
      await applyEvalToClass(api, actor, t, chatId, parts[1]!);
      return;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    await api.sendMessage(chatId, msg.includes("معتمدة") || msg.includes("إسناد")
      ? `⚠️ ${msg}` : "تعذّر تنفيذ العملية — أعد المحاولة.");
  }
}

async function refreshAttendanceKb(api: Api, actor: Actor, chatId: number, msgId: number, sessionId: string) {
  const roster = await sessionRoster(actor, sessionId);
  await api.editMessageReplyMarkup(chatId, msgId, {
    reply_markup: rosterKb(
      sessionId,
      roster.students.map((s) => ({
        studentId: s.studentId, fullName: s.fullName,
        mark: s.status ? ATT_EMOJI[s.status] : NO_MARK,
      })),
      "mk", "sv",
    ),
  });
}

async function refreshBehaviorKb(api: Api, actor: Actor, chatId: number, msgId: number, sessionId: string) {
  const roster = await sessionRoster(actor, sessionId);
  const entries = await prisma.behaviorEntry.findMany({
    where: { lessonSessionId: sessionId, teacherId: actor.userId, category: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  const current = new Map<string, BehaviorCategory>();
  for (const e of entries) current.set(e.studentId, e.category as BehaviorCategory);
  await api.editMessageReplyMarkup(chatId, msgId, {
    reply_markup: rosterKb(
      sessionId,
      roster.students.map((s) => ({
        studentId: s.studentId, fullName: s.fullName,
        mark: current.has(s.studentId) ? BEH_EMOJI[current.get(s.studentId)!] : NO_MARK,
      })),
      "bk", "bv",
    ),
  });
}

// ---------- معالج التقييم ----------

async function startEvaluation(api: Api, actor: Actor, t: TgTeacher, chatId: number, studentId: string) {
  // مواد المعلم في صف الطالب
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!year) return;
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, academicYearId: year.id },
  });
  if (!enrollment) {
    await api.sendMessage(chatId, "الطالب غير مسجل في صف هذا العام.");
    return;
  }
  const subjects = await prisma.teachingAssignment.findMany({
    where: { teacherId: t.id, classId: enrollment.classId, academicYearId: year.id, isActive: true },
    include: { subject: { select: { id: true, name: true } } },
  });
  if (!subjects.length) {
    await api.sendMessage(chatId, "لا مادة مسندة لك في صف هذا الطالب.");
    return;
  }
  const ev: EvState = { studentId, subjectId: "", values: {} };
  if (subjects.length === 1) {
    ev.subjectId = subjects[0]!.subjectId;
    await setState(t.id, { ev });
    await evalStep(api, chatId, ev, 0);
    return;
  }
  await setState(t.id, { ev });
  await api.sendMessage(chatId, "اختر المادة للتقييم:", {
    reply_markup: {
      inline_keyboard: subjects.map((s) => [{
        text: s.subject.name,
        callback_data: `es:${studentId}:${s.subjectId}`,
      }]),
    },
  });
}

async function evalStep(api: Api, chatId: number, ev: EvState, idx: number) {
  const step = EV_STEPS[idx]!;
  const prefix = idx === 0 ? "ep" : idx === 1 ? "ea" : "eb";
  await api.sendMessage(
    chatId,
    `⭐ التقييم — ${idx + 1}/3 ${step.label}:`,
    {
      reply_markup: {
        inline_keyboard: step.options.map((o, i) => [{ text: o, callback_data: `${prefix}:${i}` }]),
      },
    },
  );
}

async function finishEvaluation(
  api: Api, actor: Actor, userId: string, chatId: number,
  ev: EvState,
) {
  const weekStart = weekStartOf(schoolToday(await schoolTimezone()));
  for (const [category, value] of Object.entries(ev.values)) {
    await setEvaluation(actor, {
      studentId: ev.studentId, subjectId: ev.subjectId,
      weekStart, category, value,
    });
  }
  await setState(userId, { ev: undefined });
  const student = await prisma.student.findUnique({ where: { id: ev.studentId }, select: { fullName: true } });
  await api.sendMessage(
    chatId,
    `⭐ حُفظ تقييم ${student?.fullName ?? "الطالب"} لهذا الأسبوع:\n` +
    Object.entries(ev.values).map(([k, v]) => `  ▫️ ${k}: ${v}`).join("\n") +
    `\n  ▫️ الدرجة الأكاديمية والتقدير تُحسب من الاختبارات آلياً`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "👥 تطبيق على الصف كاملاً", callback_data: `el:${ev.studentId}` },
        ]],
      },
    },
  );
}

async function applyEvalToClass(api: Api, actor: Actor, t: TgTeacher, chatId: number, studentId: string) {
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  const enrollment = year ? await prisma.enrollment.findFirst({
    where: { studentId, academicYearId: year.id },
  }) : null;
  const st = (t.telegramState as TgState)?.ev;
  // بعد الحفظ تُمسح الحالة — نقرأ تقييمات هذا الأسبوع المحفوظة مباشرة
  const weekStart = weekStartOf(schoolToday(await schoolTimezone()));
  const evals = await prisma.evaluation.findMany({
    where: { teacherId: t.id, studentId, weekStart, ...(st?.subjectId ? { subjectId: st.subjectId } : {}) },
  });
  if (!enrollment || !evals.length) {
    await api.sendMessage(chatId, "لا تقييم محفوظ لهذا الطالب.");
    return;
  }
  const classmates = await prisma.enrollment.findMany({
    where: { classId: enrollment.classId, academicYearId: year!.id, student: { isActive: true } },
    select: { studentId: true },
  });
  let n = 0;
  for (const c of classmates) {
    for (const e of evals) {
      if (!e.subjectId) continue;
      await setEvaluation(actor, {
        studentId: c.studentId, subjectId: e.subjectId,
        weekStart, category: e.category, value: e.value,
      });
    }
    n++;
  }
  await api.sendMessage(chatId, `👥 طُبّق التقييم على ${n} طالباً في الصف.`);
}

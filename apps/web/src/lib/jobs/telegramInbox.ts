/**
 * معالجة تحديثات تيليجرام الواردة من webhook (مسجلة في TelegramUpdateInbox).
 *
 * أولياء الأمور:
 * - /start, /status, /stop، مشاركة جهة الاتصال للربط، نص باسم طالب → تقرير فوري.
 *
 * المعلمون (حساب مرتبط بدور teacher/admin):
 * - «حضور»/«سلوك» → كشوفات تفاعلية، اسم طالب → تقرير + معالج تقييم،
 *   وكل ضغطات الأزرار (callback_query) عبر teacherBot.
 *
 * معالجة كل update مرة واحدة (update_id فريد).
 */

import { prisma } from "@app/db";
import { buildStudentReport, schoolToday, schoolTodayStr, schoolTimezone } from "@app/core";
import type { Actor } from "@app/core";
import { createGuardianAccount, generatePassword } from "@app/auth";
import { botApi } from "../telegram";
import { teacherByChat, handleTeacherText, handleTeacherCallback } from "./teacherBot";

const SYSTEM_ACTOR: Actor = { userId: "system", role: "admin", isActive: true };

interface TgMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
}

interface TgCallbackQuery {
  id: string;
  from: { id: number };
  data?: string;
  message?: { message_id: number; chat: { id: number } };
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

function normalizePhone(p: string): string {
  return p.replace(/\D/g, "").replace(/^0+/, "");
}

export async function processTelegramUpdate(inboxId: string): Promise<void> {
  // مطالبة ذرّية — تيليجرام قد يكرر التسليم؛ نسخة واحدة فقط تكسب pending→processing
  const claim = await prisma.telegramUpdateInbox.updateMany({
    where: { id: inboxId, status: "pending" },
    data: { status: "processing" },
  });
  if (!claim.count) return;

  const inbox = await prisma.telegramUpdateInbox.findUnique({
    where: { id: inboxId },
  });
  if (!inbox) return;

  const update = inbox.payload as unknown as TgUpdate;
  const msg = update.message;
  const cq = update.callback_query;
  const api = botApi();

  try {
    if (cq?.message && cq.data !== undefined) {
      const teacher = await teacherByChat(cq.message.chat.id);
      if (teacher) await handleTeacherCallback(teacher, cq);
      else await api.answerCallbackQuery(cq.id, { text: "المحادثة غير مرتبطة بحساب معلم." });
    } else if (msg?.contact?.phone_number) {
      await linkByContact(msg);
    } else if (msg?.text) {
      const chatId = msg.chat.id;
      const teacher = await teacherByChat(chatId);
      const text = msg.text;

      if (text.startsWith("/start")) {
        if (teacher) {
          await api.sendMessage(
            chatId,
            `أهلاً أ. ${teacher.name}\n\n` +
            "• أرسل «حضور» لتسجيل حضور حصة، «سلوك» لرصد سلوكها\n" +
            "• أرسل اسم طالب لتقريره ومعالج تقييمه\n" +
            "• /status لحالة الربط — /stop لإلغائه",
          );
        } else {
          await api.sendMessage(
            chatId,
            "مرحباً بك في نظام متابعة الطلاب.\n" +
            "• لربط حسابك: شارك جهة اتصالك الموثقة لدى المدرسة.\n" +
            "• /status لحالة الربط — /stop لإلغائه.\n" +
            "• أرسل اسم ابنك/ابنتك لطلب تقرير آخر 7 أيام.",
          );
        }
      } else if (text.startsWith("/status")) {
        if (teacher) await api.sendMessage(chatId, `حسابك مرتبط كمعلم: ${teacher.name}`);
        else await sendStatus(msg);
      } else if (text.startsWith("/stop")) {
        await unlink(msg);
      } else if (teacher) {
        await handleTeacherText(teacher, chatId, text.trim());
      } else {
        await reportOnDemand(msg);
      }
    }

    await prisma.telegramUpdateInbox.update({
      where: { id: inbox.id },
      data: { status: "processed", processedAt: new Date() },
    });
  } catch (err) {
    await prisma.telegramUpdateInbox.update({
      where: { id: inbox.id },
      data: { status: "failed", processedAt: new Date() },
    });
    throw err;
  }
}

/** ولي الأمر المرتبط بهذه المحادثة إن وُجد */
async function guardianByChat(chatId: number) {
  const user = await prisma.user.findFirst({
    where: { telegramChatId: String(chatId), isActive: true },
  });
  if (!user) return null;
  return prisma.guardianProfile.findUnique({
    where: { userId: user.id },
    include: {
      user: true,
      children: {
        where: { verified: true },
        include: { student: { select: { id: true, fullName: true, isActive: true } } },
      },
    },
  });
}

async function sendStatus(msg: TgMessage) {
  const api = botApi();
  const g = await guardianByChat(msg!.chat.id);
  if (!g) {
    await api.sendMessage(msg!.chat.id, "المحادثة غير مرتبطة. شارك جهة اتصالك الموثقة لدى المدرسة.");
    return;
  }
  const kids = g.children.map((c) => `• ${c.student.fullName}`).join("\n");
  await api.sendMessage(
    msg!.chat.id,
    `حسابك مرتبط يا ${g.user.name}.\nالأبناء المرتبطون (${g.children.length}):\n${kids || "—"}`,
  );
}

async function unlink(msg: TgMessage) {
  const api = botApi();
  const res = await prisma.user.updateMany({
    where: { telegramChatId: String(msg!.chat.id) },
    data: { telegramChatId: null },
  });
  await api.sendMessage(
    msg!.chat.id,
    res.count
      ? "أُلغي ربط هذه المحادثة. لن تصلك تنبيهات هنا — البوابة تبقى متاحة."
      : "هذه المحادثة غير مرتبطة أصلاً.",
  );
}

/** تقرير فوري بطلب ولي أمر — يطابق اسم الطالب ضمن أبنائه المرتبطين فقط */
async function reportOnDemand(msg: TgMessage) {
  const api = botApi();
  const g = await guardianByChat(msg!.chat.id);
  if (!g) {
    await api.sendMessage(msg!.chat.id, "المحادثة غير مرتبطة بولي أمر موثق. شارك جهة اتصالك أولاً.");
    return;
  }
  const q = msg!.text!.trim().replace(/\s+/g, " ");
  const student = g.children.find((c) =>
    c.student.isActive &&
    (c.student.fullName.includes(q) || q.includes(c.student.fullName)),
  )?.student;

  if (!student) {
    await api.sendMessage(
      msg!.chat.id,
      "لم يُعثر على طالب بهذا الاسم ضمن أبنائك المرتبطين. تأكد من الاسم أو راجع الإدارة.",
    );
    return;
  }

  // تقرير آخر 7 أيام — لقطة موجودة تُعاد استخدامها
  const tz = await schoolTimezone();
  const rangeEnd = schoolToday(tz);
  const rangeStart = new Date(rangeEnd);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);

  let snap = await prisma.reportSnapshot.findFirst({
    where: { studentId: student.id, rangeStart, rangeEnd, status: { in: ["approved", "sent"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!snap) {
    const content = await buildStudentReport(SYSTEM_ACTOR, {
      studentId: student.id, rangeStart, rangeEnd,
    });
    snap = await prisma.reportSnapshot.create({
      data: {
        studentId: student.id, rangeStart, rangeEnd,
        contentJson: content as never,
        status: "approved",
        approvedById: SYSTEM_ACTOR.userId,
        approvedAt: new Date(),
      },
    });
  }

  const today = schoolTodayStr(tz);
  await prisma.outboxEvent.upsert({
    where: { idempotencyKey: `ondemand:${student.id}:${g.id}:${today}` },
    create: {
      type: "report_send",
      channel: "telegram",
      idempotencyKey: `ondemand:${student.id}:${g.id}:${today}`,
      payload: {
        reportSnapshotId: snap.id,
        studentId: student.id,
        guardianId: g.id,
        telegramChatId: String(msg!.chat.id),
      },
    },
    update: {},
  });
  await api.sendMessage(msg!.chat.id, `سيصلك تقرير «${student.fullName}» خلال لحظات إن شاء الله.`);
}

/**
 * ربط المحادثة بمشاركة جهة الاتصال:
 * أولاً مطابقة هاتف ولي أمر موثق، ثم هاتف مستخدم (معلم/إدارة).
 */
async function linkByContact(msg: TgMessage): Promise<void> {
  const phone = msg.contact!.phone_number;
  const normalized = normalizePhone(phone);
  const api = botApi();
  const tail = normalized.slice(-8);

  // أولوية: ولي أمر موثق
  const guardians = await prisma.guardianProfile.findMany({
    where: { phone: { not: null } },
    include: { user: true },
  });
  const g = guardians.find(
    (x) => x.phone && normalizePhone(x.phone).endsWith(tail),
  );
  if (g) {
    await prisma.user.update({
      where: { id: g.userId },
      data: { telegramChatId: String(msg.chat.id) },
    });
    await api.sendMessage(
      msg.chat.id,
      `تم ربط حسابك بنجاح يا ${g.user.name}. ستصلك تقارير أبنائك هنا.`,
    );
    return;
  }

  // ثم مستخدم بصلاحية معلم/إدارة — ربط بـUser.phone
  const staff = await prisma.user.findMany({
    where: { phone: { not: null }, isActive: true, role: { in: ["teacher", "admin"] } },
  });
  const u = staff.find((x) => x.phone && normalizePhone(x.phone!).endsWith(tail));
  if (u) {
    await prisma.user.update({
      where: { id: u.id },
      data: { telegramChatId: String(msg.chat.id) },
    });
    await api.sendMessage(
      msg.chat.id,
      `تم ربط حسابك كمعلم يا ${u.name}.\n` +
      "أرسل «حضور» أو «سلوك» لرصد حصصك، أو اسم طالب لتقريره.",
    );
    return;
  }

  // ثم رقم مسجل على طالب بلا حساب — إنشاء حساب ضمني وربط كل أبنائه بالرقم
  const students = await prisma.student.findMany({
    where: { guardianPhone: { not: null }, isActive: true },
    select: { id: true, fullName: true, guardianPhone: true, guardianName: true },
  });
  const matched = students.filter(
    (s) => s.guardianPhone && normalizePhone(s.guardianPhone).endsWith(tail),
  );
  if (matched.length) {
    const displayName =
      matched.find((s) => s.guardianName && s.guardianName !== "ولي الأمر")
        ?.guardianName ?? `ولي أمر ${matched[0]!.fullName.split(" ").slice(0, 2).join(" ")}`;
    // المحادثة قد تكون مرتبطة بحساب آخر (معلم هو ولي أمر أيضاً) — telegramChatId فريد
    const chatTaken = await prisma.user.findFirst({
      where: { telegramChatId: String(msg.chat.id) },
      select: { id: true, role: true },
    });
    const account = await createGuardianAccount({
      displayName,
      phone: msg.contact!.phone_number,
      password: generatePassword(), // ضمنية — دخول البوابة لاحقاً عبر ضبط كلمة مرور
      telegramChatId: chatTaken ? undefined : String(msg.chat.id),
    });
    for (const s of matched) {
      await prisma.guardianStudent.upsert({
        where: { guardianId_studentId: { guardianId: account.guardianId, studentId: s.id } },
        create: { guardianId: account.guardianId, studentId: s.id, verified: true },
        update: { verified: true },
      });
    }
    const kids = matched.map((s) => `• ${s.fullName}`).join("\n");
    await api.sendMessage(
      msg.chat.id,
      `أهلاً بك يا ${displayName}.\nتم ربط حسابك بأبنائك (${matched.length}):\n${kids}\n` +
      (chatTaken
        ? "ملاحظة: هذه المحادثة مرتبطة بحساب آخر، فلن تصلك التقارير هنا — راجع الإدارة أو استخدم تيليجراماً آخر."
        : "ستصلك تقاريرهم الأسبوعية هنا. أرسل اسم ابنك لطلب تقرير فوري."),
    );
    return;
  }

  await api.sendMessage(
    msg.chat.id,
    "لم يُعثر على هذا الرقم في سجلات المدرسة. راجع الإدارة لتحديث بياناتك.",
  );
}

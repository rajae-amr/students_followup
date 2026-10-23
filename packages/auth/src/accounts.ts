/**
 * إنشاء حسابات أولياء أمور — يستخدمه:
 * - الإنشاء الآلي الجماعي من لوحة الإدارة (كلمة مرور أولية + تغيير إلزامي)
 * - الربط الذاتي من بوت تيليجرام (حساب ضمني بكلمة مرور عشوائية)
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@app/db";
import { auth } from "./index";

/** كلمة مرور أولية مقروءة — 10 خانات بلا أحرف متشابهة */
export function generatePassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const buf = randomBytes(10);
  return [...buf].map((b) => abc[b % abc.length]).join("");
}

/** اسم مستخدم فريد — base + لاحقة عند التعارض */
async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; ; i++) {
    const taken = await prisma.user.findUnique({ where: { username: candidate } });
    if (!taken) return candidate;
    candidate = `${base}_${i}`;
  }
}

/**
 * ينشئ User(guardian) + GuardianProfile بمعاملة واحدة.
 * يعيد معرّف المستخدم والملف واسم المستخدم النهائي.
 */
export async function createGuardianAccount(input: {
  displayName: string;
  phone: string | null;
  password: string;
  telegramChatId?: string;
  mustChangePassword?: boolean;
}): Promise<{ userId: string; guardianId: string; username: string }> {
  const digits = (input.phone ?? "").replace(/\D/g, "").slice(-9) || "x";
  const username = await uniqueUsername(`g${digits}`);

  const res = await auth.api.signUpEmail({
    body: {
      email: `${username}@internal.school`,
      password: input.password,
      name: input.displayName,
      username,
    },
  });
  const userId = (res as { user?: { id: string } }).user?.id;
  if (!userId) throw new Error("تعذر إنشاء حساب ولي الأمر");

  const guardian = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        role: "guardian",
        mustChangePassword: input.mustChangePassword ?? false,
        telegramChatId: input.telegramChatId ?? null,
      },
    });
    return tx.guardianProfile.create({
      data: { userId, phone: input.phone },
    });
  }).catch(async (e) => {
    // signUpEmail يثبت المستخدم خارج المعاملة — نظّف اليتيم عند الفشل
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    throw e;
  });

  return { userId, guardianId: guardian.id, username };
}

/**
 * ينشئ User(teacher) + TeacherProfile — للإنشاء الإداري المباشر.
 * الهاتف يُخزَّن ليتمكن المعلم من ربط تيليجرام بمشاركة جهة الاتصال.
 */
export async function createTeacherAccount(input: {
  displayName: string;
  phone: string | null;
  password: string;
  defaultSubject?: string | null;
  mustChangePassword?: boolean;
}): Promise<{ userId: string; username: string }> {
  const digits = (input.phone ?? "").replace(/\D/g, "").slice(-9);
  const username = await uniqueUsername(
    digits ? `t${digits}` : `t${randomBytes(3).toString("hex")}`,
  );

  const res = await auth.api.signUpEmail({
    body: {
      email: `${username}@internal.school`,
      password: input.password,
      name: input.displayName,
      username,
    },
  });
  const userId = (res as { user?: { id: string } }).user?.id;
  if (!userId) throw new Error("تعذر إنشاء حساب المعلم");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        role: "teacher",
        phone: input.phone,
        mustChangePassword: input.mustChangePassword ?? false,
      },
    });
    await tx.teacherProfile.create({
      data: {
        userId,
        defaultSubject: input.defaultSubject ?? null,
      },
    });
  }).catch(async (e) => {
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    throw e;
  });

  return { userId, username };
}

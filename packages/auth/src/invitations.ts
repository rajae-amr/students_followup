/**
 * دعوات المدرسة — الطريقة الوحيدة لإنشاء الحسابات.
 *
 * - رمز عشوائي أحادي الاستخدام، يُخزن كهاش SHA-256 فقط.
 * - صلاحية ومحاولات محدودة.
 * - تفعيل دعوة ولي الأمر ينشئ حساباً ويربطه بالأبناء الموثقين مسبقاً من الإدارة.
 * - لا علاقة بالأبناء تنشأ من اسم المستخدم أو الهاتف — من حمولة الدعوة الموثقة فقط.
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@app/db";
import { auth } from "./index";

const TOKEN_TTL_HOURS = 72;
const MAX_ATTEMPTS = 5;

export class InvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationError";
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** الإدارة تنشئ دعوة — تعيد الرمز الخام مرة واحدة لإيصاله لولي الأمر */
export async function createInvitation(input: {
  type: "guardian" | "staff";
  createdById: string;
  /** للأولياء: أرقام الطلاب الموثقون مسبقاً في guardian_students draft */
  studentIds?: string[];
  role?: "teacher" | "admin";
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000);

  await prisma.invitation.create({
    data: {
      type: input.type,
      tokenHash: hashToken(token),
      payload: {
        studentIds: input.studentIds ?? [],
        role: input.role ?? (input.type === "staff" ? "teacher" : "guardian"),
      },
      createdById: input.createdById,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/**
 * تفعيل الدعوة: ينشئ الحساب (username + password) ويربط الصلاحيات.
 * يعيد معرّف المستخدم الجديد.
 */
export async function redeemInvitation(input: {
  token: string;
  username: string;
  password: string;
  displayName: string;
}): Promise<{ userId: string; role: string }> {
  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    throw new InvitationError("الدعوة غير صالحة أو منتهية");
  }
  if (invite.attempts >= MAX_ATTEMPTS) {
    throw new InvitationError("تجاوزت المحاولات المسموحة — اطلب دعوة جديدة");
  }

  const taken = await prisma.user.findUnique({
    where: { username: input.username },
  });
  if (taken) throw new InvitationError("اسم المستخدم محجوز — اختر اسماً آخر");

  const payload = (invite.payload ?? {}) as {
    studentIds?: string[];
    role?: string;
  };
  const role = payload.role ?? "guardian";

  // إنشاء الحساب عبر better-auth (username plugin)
  const res = await auth.api.signUpEmail({
    body: {
      email: `${input.username}@internal.school`, // معرف داخلي غير قابل للتسليم
      password: input.password,
      name: input.displayName,
      username: input.username,
    },
  });
  const userId = (res as { user?: { id: string } }).user?.id;
  if (!userId) throw new InvitationError("تعذر إنشاء الحساب");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { role: role as "admin" | "teacher" | "guardian" },
    });
    await tx.invitation.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: userId },
    });

    if (role === "guardian") {
      // هاتف ولي الأمر المدخل إدارياً يتدفق إلى الملف — يستخدمه تيليجرام للربط
      const students = await tx.student.findMany({
        where: { id: { in: payload.studentIds ?? [] } },
        select: { guardianPhone: true },
      });
      const phone = students.find((s) => s.guardianPhone)?.guardianPhone ?? null;
      const profile = await tx.guardianProfile.create({
        data: { userId, ...(phone ? { phone } : {}) },
      });
      for (const studentId of payload.studentIds ?? []) {
        await tx.guardianStudent.upsert({
          where: { guardianId_studentId: { guardianId: profile.id, studentId } },
          create: {
            guardianId: profile.id,
            studentId,
            verified: true,
            createdById: invite.createdById,
          },
          update: { verified: true },
        });
      }
    } else {
      await tx.teacherProfile.create({ data: { userId } });
    }
  });

  return { userId, role };
}

/** تسجيل محاولة فاشلة (يُستدعى من مسار API قبل التحقق) */
export async function registerFailedAttempt(token: string): Promise<void> {
  await prisma.invitation.updateMany({
    where: { tokenHash: hashToken(token), usedAt: null },
    data: { attempts: { increment: 1 } },
  });
}

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username, admin as adminPlugin } from "better-auth/plugins";
import { prisma } from "@app/db";

/**
 * مصادقة النظام:
 * - دخول باسم المستخدم وكلمة المرور (أولياء الأمور والمعلمون دون بريد إلزامي)
 * - جلسات قاعدة بيانات قابلة للإبطال
 * - أدوار: admin | teacher | guardian
 * - لا تسجيل عام — الحسابات عبر دعوات الإدارة فقط
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    disableSignUp: true, // لا تسجيل عام — دعوات فقط
  },

  plugins: [
    username(),
    adminPlugin({
      defaultRole: "teacher",
      adminRoles: ["admin"],
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7, // أسبوع
    updateAge: 60 * 60 * 24, // تمديد يومي
    cookieCache: { enabled: false }, // جلسات قاعدة بيانات قابلة للإبطال
  },

  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "teacher" },
      isActive: { type: "boolean", defaultValue: true },
      phone: { type: "string", required: false },
      telegramChatId: { type: "string", required: false },
      mustChangePassword: { type: "boolean", defaultValue: false },
    },
  },

  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
});

export type Session = typeof auth.$Infer.Session;

export {
  createInvitation,
  redeemInvitation,
  registerFailedAttempt,
  InvitationError,
} from "./invitations";

export { createGuardianAccount, createTeacherAccount, generatePassword } from "./accounts";

/**
 * إنشاء أول حساب إدارة وإعدادات المدرسة — يُشغّل مرة واحدة.
 *
 * الاستخدام:
 *   npx tsx scripts/bootstrap.ts --username admin --password 'كلمة-قوية' --name "مدير النظام"
 *
 * آمن لإعادة التشغيل: لا يكرر حساباً موجوداً ولا يكتب فوق إعدادات مضبوطة.
 * لا يُشغَّل على الإنتاج إلا من قناة موثوقة — كلمة المرور تمر كوسيط.
 */

import { auth } from "@app/auth";
import { prisma } from "@app/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const username = arg("username") ?? "admin";
  const password = arg("password");
  const name = arg("name") ?? "مدير النظام";

  if (!password || password.length < 8) {
    console.error("كلمة المرور مطلوبة (8 أحرف فأكثر): --password");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`الحساب "${username}" موجود مسبقاً — لا تغيير.`);
  } else {
    const res = await auth.api.signUpEmail({
      body: {
        email: `${username}@internal.school`, // معرف داخلي غير قابل للتسليم
        password,
        name,
        username,
      },
    });
    const userId = (res as { user?: { id: string } }).user?.id;
    if (!userId) throw new Error("فشل إنشاء الحساب");
    await prisma.user.update({
      where: { id: userId },
      data: { role: "admin", emailVerified: true },
    });
    console.log(`أُنشئ حساب الإدارة: ${username}`);
  }

  await prisma.schoolSettings.upsert({
    where: { id: "school" },
    create: {
      id: "school",
      schoolName: process.env.SCHOOL_NAME ?? "المدرسة",
      timezone: process.env.SCHOOL_TIMEZONE ?? "Asia/Muscat",
    },
    update: {},
  });
  console.log("إعدادات المدرسة جاهزة.");

  const yearName = arg("year") ?? "2026/2027";
  await prisma.academicYear.upsert({
    where: { name: yearName },
    create: {
      name: yearName,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2027-06-30"),
      isCurrent: true,
    },
    update: {},
  });
  console.log(`العام الدراسي: ${yearName}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

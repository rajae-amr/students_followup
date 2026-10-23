/**
 * إعادة ضبط كلمة مرور مدير — يولّد كلمة جديدة ويطبعها مرة واحدة.
 * الاستخدام: DATABASE_URL=... npx tsx scripts/reset-admin.ts [--username admin]
 * نفس آلية «إعادة تعيين كلمة المرور» في لوحة الإدارة.
 */

import { prisma } from "@app/db";
import { hashPassword } from "better-auth/crypto";

const username = process.argv.includes("--username")
  ? process.argv[process.argv.indexOf("--username") + 1]!
  : "admin";

async function main() {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`المستخدم "${username}" غير موجود`);
    process.exit(1);
  }

  const newPassword = `Sch-${Math.random().toString(36).slice(2, 10)}!`;
  const hashed = await hashPassword(newPassword);
  const updated = await prisma.account.updateMany({
    where: { userId: user.id, providerId: "credential" },
    data: { password: hashed },
  });
  if (!updated.count) {
    console.error("لا حساب credential لهذا المستخدم");
    process.exit(1);
  }
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`\n✅ أُعيد ضبط كلمة مرور «${username}» (${user.name})`);
  console.log(`   اسم المستخدم: ${username}`);
  console.log(`   كلمة المرور:  ${newPassword}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@app/db";
import { parsePerms } from "@app/core";
import { requireActor } from "./session";

export type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  href?: string;
};

/** معرفات مسؤولي التقارير: المديرون + الإداريون المفوَّضون بصلاحية reports */
export async function reportManagerIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["admin", "staff"] } },
    select: { id: true, role: true, permissions: true },
  });
  return users
    .filter((u) => u.role === "admin" || parsePerms(u.permissions).includes("reports"))
    .map((u) => u.id);
}

/** إنشاء إشعار لمجموعة مستخدمين — يُستدعى من إجراءات الخادم الأخرى */
export async function notifyUsers(userIds: string[], n: NotificationInput) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({ userId, ...n })),
  });
}

/** تعيين إشعار واحد كمقروء (لمالكه فقط) */
export async function markNotificationRead(id: string) {
  const actor = await requireActor();
  await prisma.notification.updateMany({
    where: { id, userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

/** تعيين كل إشعارات المستخدم كمقروءة */
export async function markAllNotificationsRead() {
  const actor = await requireActor();
  await prisma.notification.updateMany({
    where: { userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

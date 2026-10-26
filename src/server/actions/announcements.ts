"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@app/db";
import { requirePerm, requireRole } from "../session";
import { notifyUsers } from "../notify";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const AUDIENCE_AR: Record<string, string> = {
  all: "الجميع",
  guardians: "أولياء الأمور",
  teachers: "المعلمين",
};

/** نشر إعلان — يولّد إشعاراً داخلياً للجمهور المستهدف */
export async function createAnnouncement(formData: FormData): Promise<Result> {
  try {
    const actor = await requirePerm("reports");
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const audience = String(formData.get("audience") ?? "all");
    if (!title || !body) return fail("العنوان والنص مطلوبان");
    if (!["all", "guardians", "teachers"].includes(audience)) return fail("جمهور غير صحيح");

    await prisma.announcement.create({
      data: { title, body, audience, createdById: actor.userId },
    });

    // إشعار داخلي للجمهور
    const targets = new Set<string>();
    if (audience !== "teachers") {
      const guardians = await prisma.guardianProfile.findMany({
        where: { children: { some: { verified: true } } },
        select: { userId: true },
      });
      guardians.forEach((g) => targets.add(g.userId));
    }
    if (audience !== "guardians") {
      const teachers = await prisma.user.findMany({
        where: { role: "teacher", isActive: true },
        select: { id: true },
      });
      teachers.forEach((t) => targets.add(t.id));
    }
    await notifyUsers([...targets], {
      type: "announcement",
      title: `إعلان: ${title}`,
      body: body.slice(0, 120),
      href: audience === "teachers" ? "/teacher" : "/parent",
    });

    revalidatePath("/admin/announcements");
    revalidatePath("/parent");
    revalidatePath("/teacher");
    return { ok: true, message: `نُشر الإعلان لـ${AUDIENCE_AR[audience]} وأُرسلت الإشعارات` };
  } catch {
    return fail("تعذر نشر الإعلان");
  }
}

/** حذف إعلان — مدير فقط */
export async function deleteAnnouncement(formData: FormData): Promise<Result> {
  try {
    await requireRole("admin");
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("معرّف مفقود");
    await prisma.announcement.delete({ where: { id } });
    revalidatePath("/admin/announcements");
    return { ok: true, message: "حُذف الإعلان" };
  } catch {
    return fail("تعذر الحذف");
  }
}

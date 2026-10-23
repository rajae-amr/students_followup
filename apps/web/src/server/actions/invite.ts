"use server";

import { redeemInvitation, InvitationError } from "@app/auth";

export type InviteResult = { ok: true; role: string } | { ok: false; error: string };

export async function redeemInvite(input: {
  token: string;
  username: string;
  password: string;
  displayName: string;
}): Promise<InviteResult> {
  try {
    if (input.password.length < 8)
      return { ok: false, error: "كلمة المرور 8 أحرف فأكثر" };
    const res = await redeemInvitation(input);
    return { ok: true, role: res.role };
  } catch (e) {
    if (e instanceof InvitationError) return { ok: false, error: e.message };
    return { ok: false, error: "تعذر تفعيل الدعوة" };
  }
}

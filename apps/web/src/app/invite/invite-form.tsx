"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { redeemInvite } from "@/server/actions/invite";

export function InviteForm({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    token: initialToken,
    displayName: "",
    username: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await redeemInvite(form);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push("/login?invited=1");
  }

  const input =
    "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">رمز الدعوة</label>
        <input value={form.token} onChange={set("token")} required className={input} dir="ltr" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">الاسم الكامل</label>
        <input value={form.displayName} onChange={set("displayName")} required className={input} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">اسم المستخدم</label>
        <input value={form.username} onChange={set("username")} required className={input} dir="ltr" autoComplete="username" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">كلمة المرور</label>
        <input type="password" value={form.password} onChange={set("password")} required minLength={8} className={input} autoComplete="new-password" />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-100">{error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "جارٍ التفعيل..." : "تفعيل الحساب"}
      </button>
    </form>
  );
}

import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@app/db";

/**
 * شعار المدرسة + اسمها — يعرض public/logo.png إن وُضع،
 * وإلا بديلاً بلون الهوية يحمل أول حرفين من الاسم.
 */
export async function Logo({
  size = "md",
  dark = false,
}: {
  size?: "md" | "lg";
  /** نص فاتح — للخلفيات الداكنة كالشريط الجانبي */
  dark?: boolean;
}) {
  const settings = await prisma.schoolSettings.findUnique({
    where: { id: "school" },
    select: { schoolName: true },
  });
  const name = settings?.schoolName ?? "نظام متابعة الطلاب";
  const hasLogo = existsSync(join(process.cwd(), "public", "logo.png"));
  const dim = size === "lg" ? "h-14 w-14 text-xl" : "h-10 w-10 text-sm";

  return (
    <span className="flex min-w-0 items-center gap-3">
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logo.png"
          alt={name}
          className={`${dim} shrink-0 rounded-xl bg-white object-contain shadow-soft ring-1 ring-slate-100`}
        />
      ) : (
        <span
          className={`grid ${dim} shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 font-bold text-white shadow-soft`}
          aria-hidden
        >
          {name.slice(0, 2)}
        </span>
      )}
      <span className={`truncate font-bold ${dark ? "text-white" : "text-slate-800"} ${size === "lg" ? "text-xl" : "text-sm"}`}>
        {name}
      </span>
    </span>
  );
}

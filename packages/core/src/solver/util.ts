export const DAY_NAMES = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const;

export function dayName(d: number): string {
  return DAY_NAMES[d] ?? `يوم ${d}`;
}

// يوحّد مسمى التخصص: حذف «ال» التعريف من بداية كل كلمة وتنظيف المسافات
export function canonicalSpecialization(input: string | null | undefined): string {
  const s = (input ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s
    .split(" ")
    .map((w) =>
      w.startsWith("وال")
        ? "و" + w.slice(3)
        : w.startsWith("ال")
          ? w.slice(2)
          : w.startsWith("لل")
            ? "ل" + w.slice(2)
            : w
    )
    .filter(Boolean)
    .join(" ");
}

// مفتاح مطابقة متساهل بين «التخصص» و«اسم المادة»
export function specializationKey(input: string | null | undefined): string {
  return canonicalSpecialization(input)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

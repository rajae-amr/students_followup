const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/** شريط فلترة المدى الزمني/الفصل — مشترك بين صفحات التحليلات (GET form) */
export function FilterBar({
  range,
  termId,
  terms,
}: {
  range: string;
  termId: string;
  terms: { id: string; name: string }[];
}) {
  return (
    <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
      <select name="range" defaultValue={range} className={input}>
        <option value="7">آخر 7 أيام</option>
        <option value="30">آخر 30 يوماً</option>
        <option value="90">آخر 90 يوماً</option>
        {terms.length > 0 && <option value="term">فصل دراسي</option>}
      </select>
      {terms.length > 0 && (
        <select name="term" defaultValue={termId} className={input}>
          <option value="">الفصل…</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
      <button className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
        تطبيق
      </button>
    </form>
  );
}

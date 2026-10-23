export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-label="جارٍ التحميل">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-slate-200/70" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-2xl bg-white ring-1 ring-slate-100"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

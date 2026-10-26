/** هياكل تحميل — كتل متحركة باهتة تحاكي المحتوى الفعلي */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-xl bg-slate-200/70 motion-reduce:animate-none ${className}`}
    />
  );
}

/** بطاقة إحصائية (StatCard) */
export function SkeletonStat() {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/80">
      <Skeleton className="h-12 w-12 rounded-2xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-12" />
      </div>
    </div>
  );
}

/** صف إحصائيات — يطابق شبكة لوحة الإدارة */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}

/** بطاقة محتوى بسيطة */
export function SkeletonCard({ className = "", lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/80 ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"} mb-2`} />
      ))}
    </div>
  );
}

/** شبكة بطاقات تنقّل (NavCard) */
export function SkeletonNavGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/80">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** جدول — رأس + أسطر */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/80">
      <div className="mb-4 grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="mb-3 grid gap-4 border-b border-slate-50 pb-3 last:border-0" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? "w-3/4" : "w-full"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** ترويسة صفحة (عنوان + وصف) */
export function SkeletonHeader() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

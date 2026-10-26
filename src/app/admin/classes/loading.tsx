import { Skeleton, SkeletonCard, SkeletonHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl" aria-label="جارٍ التحميل">
      <SkeletonHeader />
      <Skeleton className="mb-6 h-40 rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-soft" />
      {[0, 1].map((s) => (
        <div key={s} className="mb-8 rounded-3xl bg-slate-100/60 p-5 ring-1 ring-slate-200/60">
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-xl" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-px flex-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} lines={1} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

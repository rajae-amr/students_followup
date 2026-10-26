import { Skeleton, SkeletonCard, SkeletonNavGrid } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl" aria-label="جارٍ التحميل">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="mb-5 h-12 rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-soft" />
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
      <SkeletonNavGrid count={4} />
    </div>
  );
}

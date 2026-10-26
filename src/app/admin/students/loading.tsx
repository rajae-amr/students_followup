import { Skeleton, SkeletonHeader, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl" aria-label="جارٍ التحميل">
      <SkeletonHeader />
      <Skeleton className="mb-4 h-11 w-72 rounded-xl" />
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}

import { Skeleton, SkeletonCard, SkeletonHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-label="جارٍ التحميل">
      <SkeletonHeader />
      <div className="space-y-4">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}

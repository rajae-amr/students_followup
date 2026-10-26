import { SkeletonHeader, SkeletonStats, SkeletonNavGrid } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl" aria-label="جارٍ التحميل">
      <SkeletonHeader />
      <SkeletonStats />
      <SkeletonNavGrid count={6} />
    </div>
  );
}

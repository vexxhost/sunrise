import { Skeleton } from "@/components/ui/skeleton";

export function QuotaSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading project quotas">
      <section className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-11" />
        <Skeleton className="h-96" />
      </section>
    </div>
  );
}

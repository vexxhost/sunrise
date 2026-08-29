import { Skeleton } from '@/components/ui/skeleton';

export function OverviewSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading cloud overview">
      <section className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      </section>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-64" />
        </section>
        <section className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-64" />
        </section>
      </div>
    </div>
  );
}

import { NavigationSkeleton } from "@/components/navigation/NavigationSkeleton";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function CloudShellSkeleton() {
  return (
    <>
      <NavigationSkeleton />
      <main>
        <div className="mx-auto w-full max-w-[1600px] space-y-9 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-52" />
            </div>
            <Skeleton className="size-9" />
          </div>
          <OverviewSkeleton />
        </div>
      </main>
    </>
  );
}

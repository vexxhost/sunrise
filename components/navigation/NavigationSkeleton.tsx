import { LayoutGrid, Search } from "lucide-react";
import { SunriseBrand } from "@/components/Brand/SunriseBrand";
import { Skeleton } from "@/components/ui/skeleton";

export function NavigationSkeleton() {
  return (
    <div
      aria-label="Loading cloud navigation"
      className="sticky top-0 z-50 w-full border-b bg-background/95"
    >
      <div className="flex h-14 w-full items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <SunriseBrand compact />
          <div className="h-6 w-px bg-border" />
          <span className="flex size-9 items-center justify-center rounded-md border text-muted-foreground">
            <LayoutGrid className="size-5" aria-hidden="true" />
          </span>
        </div>

        <div className="hidden min-w-0 flex-1 justify-center px-2 lg:flex">
          <div className="flex h-9 w-full max-w-lg items-center gap-2 rounded-md border px-3 text-muted-foreground">
            <Search className="size-4" aria-hidden="true" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="size-9" />
          <Skeleton className="hidden h-9 w-24 sm:block" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="size-9" />
        </div>
      </div>
    </div>
  );
}

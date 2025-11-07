import { ReactNode, Suspense } from "react";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";

interface PrefetchHydrationBoundaryProps {
  queries: Array<any>;
  children: ReactNode;
  fallback?: ReactNode;
}

export async function PrefetchHydrationBoundary({
  queries,
  children,
  fallback,
}: PrefetchHydrationBoundaryProps) {
  const queryClient = makeQueryClient();

  await Promise.all(queries.map((query) => queryClient.prefetchQuery(query)));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={fallback ?? <div>Loading...</div>}>{children}</Suspense>
    </HydrationBoundary>
  );
}


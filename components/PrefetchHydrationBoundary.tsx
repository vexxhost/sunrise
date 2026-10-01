import { ReactNode, Suspense } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient, hydrateQueries } from "@/lib/query-hydration";

interface PrefetchHydrationBoundaryProps {
  queries: Array<any>;
  children: ReactNode;
  fallback?: ReactNode;
  queryClient?: QueryClient;
}

export async function PrefetchHydrationBoundary({
  queries,
  children,
  fallback,
  queryClient,
}: PrefetchHydrationBoundaryProps) {
  const prefetchQueryClient = queryClient ?? makeQueryClient();

  await hydrateQueries(prefetchQueryClient, queries);
  const { cacheIdentity, state } = dehydrateQueryClient(prefetchQueryClient);

  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <Suspense fallback={fallback ?? <div>Loading...</div>}>
        {children}
      </Suspense>
    </QueryHydrationBoundary>
  );
}

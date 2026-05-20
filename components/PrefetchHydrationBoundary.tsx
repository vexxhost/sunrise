import { ReactNode, Suspense } from "react";
import {
  HydrationBoundary,
  dehydrate,
  type QueryClient,
} from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";

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

  await Promise.all(
    queries.map((query) => prefetchQueryClient.prefetchQuery(query)),
  );

  return (
    <HydrationBoundary state={dehydrate(prefetchQueryClient)}>
      <Suspense fallback={fallback ?? <div>Loading...</div>}>{children}</Suspense>
    </HydrationBoundary>
  );
}

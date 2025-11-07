import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { Suspense, ReactNode } from 'react';
import { makeQueryClient } from '@/lib/query-client';

interface DataTableHydrationBoundaryProps {
  queries: Array<any>;
  children: ReactNode;
  fallback?: ReactNode;
}

function DataTableSkeleton() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

export async function DataTableHydrationBoundary({
  queries,
  children,
  fallback = <DataTableSkeleton />,
}: DataTableHydrationBoundaryProps) {
  const queryClient = makeQueryClient();
  queries.forEach(query => {
    queryClient.prefetchQuery(query);
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={fallback}>
        {children}
      </Suspense>
    </HydrationBoundary>
  );
}

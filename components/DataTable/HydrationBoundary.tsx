import { makeQueryClient } from '@/lib/query-client';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { ReactNode, Suspense } from 'react';
import { DataTableHeader } from './Header';

interface DataTableSkeletonProps {
  resourceName: string;
}

function DataTableSkeleton({ resourceName }: DataTableSkeletonProps) {
  return <>
    <DataTableHeader resourceName={resourceName} actions={[]} />
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  </>;
}

interface DataTableHydrationBoundaryProps {
  resourceName: string;
  queries: Array<any>;
  children: ReactNode;
}

export async function DataTableHydrationBoundary({
  resourceName,
  queries,
  children,
}: DataTableHydrationBoundaryProps) {
  const queryClient = makeQueryClient();
  queries.forEach(query => {
    queryClient.prefetchQuery(query);
  });

  return <>
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<DataTableSkeleton resourceName={resourceName} />}>
        {children}
      </Suspense>
    </HydrationBoundary>
  </>;
}

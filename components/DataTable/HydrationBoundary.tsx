import { makeQueryClient } from '@/lib/query-client';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { ReactNode, Suspense } from 'react';
import { DataTableHeader } from './Header';

function DataTableSkeleton() {
  return <>
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  </>;
}

interface DataTableHydrationBoundaryProps {
  resourceName: string;
  actions?: ReactNode;
  queries: Array<any>;
  children: ReactNode;
}

export async function DataTableHydrationBoundary({
  resourceName,
  actions,
  queries,
  children,
}: DataTableHydrationBoundaryProps) {
  const queryClient = makeQueryClient();
  queries.forEach(query => {
    queryClient.prefetchQuery(query);
  });

  return <>
    <DataTableHeader resourceName={resourceName} actions={actions} />
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<DataTableSkeleton />}>
        {children}
      </Suspense>
    </HydrationBoundary>
  </>;
}

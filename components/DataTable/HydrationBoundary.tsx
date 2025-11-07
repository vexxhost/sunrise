'use client';

import { HydrationBoundary, HydrationBoundaryProps } from '@tanstack/react-query';
import { Suspense, ReactNode } from 'react';

interface DataTableHydrationBoundaryProps extends HydrationBoundaryProps {
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

export function DataTableHydrationBoundary({
  children,
  fallback = <DataTableSkeleton />,
  ...hydrationBoundaryProps
}: DataTableHydrationBoundaryProps) {
  return (
    <HydrationBoundary {...hydrationBoundaryProps}>
      <Suspense fallback={fallback}>
        {children}
      </Suspense>
    </HydrationBoundary>
  );
}

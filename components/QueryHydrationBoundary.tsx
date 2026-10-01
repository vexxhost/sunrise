"use client";

import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { makeQueryClient } from "@/lib/query-client";

export function QueryHydrationBoundary({
  children,
  state,
}: {
  children: ReactNode;
  state: DehydratedState;
}) {
  // Keep route hydration isolated from the long-lived app query client. When a
  // route is revisited, TanStack defers updates to an existing query until an
  // effect; a suspense query backed by a Server Function could otherwise run
  // during render and make Next.js update its Router from another component.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={state} queryClient={queryClient}>
        {children}
      </HydrationBoundary>
    </QueryClientProvider>
  );
}

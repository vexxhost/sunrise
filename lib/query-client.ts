/**
 * Utility functions for TanStack Query with SSR
 */

import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query';

/**
 * Creates a new QueryClient instance for server-side rendering
 * Each server render should get a fresh queryClient to avoid sharing state
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        // Enable streaming by dehydrating pending queries
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
}

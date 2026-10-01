import { dehydrate, type QueryClient } from "@tanstack/react-query";
import { unstable_rethrow } from "next/navigation";

export async function hydrateQueries(
  queryClient: QueryClient,
  queries: Array<any>,
) {
  await Promise.all(
    queries.map(async (query) => {
      try {
        await queryClient.fetchQuery(query);
      } catch (error) {
        // Redirects and other framework navigation signals must reach Next.js.
        // Ordinary data errors remain uncached so the client can retry them.
        unstable_rethrow(error);
      }
    }),
  );
}

export function dehydrateQueryClient(queryClient: QueryClient) {
  const state = dehydrate(queryClient);
  return {
    state,
    cacheIdentity: queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryHash)
      .sort()
      .join("|"),
  };
}

import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unstableRethrow: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: mocks.unstableRethrow,
}));

import { dehydrateQueryClient, hydrateQueries } from "@/lib/query-hydration";

describe("query hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps successful queries in the server query client", async () => {
    const queryClient = { fetchQuery: vi.fn().mockResolvedValue(["ready"]) };

    await hydrateQueries(queryClient as never, [{ queryKey: ["resource"] }]);

    expect(queryClient.fetchQuery).toHaveBeenCalledWith({
      queryKey: ["resource"],
    });
    expect(mocks.unstableRethrow).not.toHaveBeenCalled();
  });

  it("passes framework navigation errors back to Next.js", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    const queryClient = { fetchQuery: vi.fn().mockRejectedValue(redirect) };
    mocks.unstableRethrow.mockImplementationOnce(() => {
      throw redirect;
    });

    await expect(
      hydrateQueries(queryClient as never, [{ queryKey: ["resource"] }]),
    ).rejects.toBe(redirect);
    expect(mocks.unstableRethrow).toHaveBeenCalledWith(redirect);
  });

  it("leaves ordinary query errors for a client retry", async () => {
    const failure = new Error("Manila unavailable");
    const queryClient = { fetchQuery: vi.fn().mockRejectedValue(failure) };

    await expect(
      hydrateQueries(queryClient as never, [{ queryKey: ["resource"] }]),
    ).resolves.toBeUndefined();
    expect(mocks.unstableRethrow).toHaveBeenCalledWith(failure);
  });

  it("builds a stable route identity from every prefetched query", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    queryClient.setQueryData(["shares"], []);
    await queryClient
      .fetchQuery({
        queryKey: ["share-networks"],
        queryFn: () => Promise.reject(new Error("Manila unavailable")),
      })
      .catch(() => undefined);

    const { cacheIdentity, state } = dehydrateQueryClient(queryClient);

    expect(state.queries).toHaveLength(1);
    expect(cacheIdentity.split("|")).toEqual(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryHash)
        .sort(),
    );
  });
});

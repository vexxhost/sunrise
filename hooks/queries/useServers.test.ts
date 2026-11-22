import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/actions", () => ({
  openstack: vi.fn(),
}));
vi.mock("@/lib/openstack/nova-actions", () => ({
  getServerConsoleOutputAction: vi.fn(),
}));
vi.mock("@/lib/openstack/nova-tag-filter-actions", () => ({
  listProjectNovaServersByTags: vi.fn(),
}));

import { openstack } from "@/lib/openstack/actions";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import { listProjectNovaServersByTags } from "@/lib/openstack/nova-tag-filter-actions";

const mockedOpenstack = vi.mocked(openstack);
const mockedListByTags = vi.mocked(listProjectNovaServersByTags);

describe("serversQueryOptions", () => {
  beforeEach(() => {
    mockedOpenstack.mockReset();
    mockedListByTags.mockReset();
  });

  it("propagates collection failures instead of returning an empty list", async () => {
    mockedOpenstack.mockResolvedValueOnce(null);
    const query = serversQueryOptions("RegionOne", "project-id");

    await expect((query.queryFn as () => Promise<unknown>)()).rejects.toThrow(
      "Unable to list servers",
    );
    expect(mockedOpenstack).toHaveBeenCalledWith(
      expect.objectContaining({ errorMode: "throw" }),
    );
  });

  it("isolates filtered cache entries and delegates to the scoped action", async () => {
    const filter = { mode: "any", tags: ["env:test"] } as const;
    mockedListByTags.mockResolvedValueOnce([]);
    const query = serversQueryOptions("RegionOne", "project-id", filter);

    expect(query.queryKey).toEqual([
      "RegionOne",
      "project-id",
      "servers",
      "any",
      "env:test",
    ]);
    await expect((query.queryFn as () => Promise<unknown>)()).resolves.toEqual(
      [],
    );
    expect(mockedListByTags).toHaveBeenCalledWith(
      "RegionOne",
      "project-id",
      filter,
    );
    expect(mockedOpenstack).not.toHaveBeenCalled();
  });
});

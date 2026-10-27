import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/actions", () => ({
  openstack: vi.fn(),
}));
vi.mock("@/lib/openstack/nova-actions", () => ({
  getServerConsoleOutputAction: vi.fn(),
}));

import { openstack } from "@/lib/openstack/actions";
import { serversQueryOptions } from "@/hooks/queries/useServers";

const mockedOpenstack = vi.mocked(openstack);

describe("serversQueryOptions", () => {
  beforeEach(() => {
    mockedOpenstack.mockReset();
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
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/actions", () => ({
  openstack: vi.fn(),
}));

import { openstack } from "@/lib/openstack/actions";
import {
  snapshotQueryOptions,
  volumeQueryOptions,
} from "@/hooks/queries/useVolumes";

const mockedOpenstack = vi.mocked(openstack);

describe("Cinder detail query options", () => {
  beforeEach(() => {
    mockedOpenstack.mockReset();
  });

  it("includes the negotiated microversion in volume requests and cache keys", async () => {
    mockedOpenstack.mockResolvedValueOnce({ volume: { id: "volume-a" } });
    const query = volumeQueryOptions(
      "RegionOne",
      "project-a",
      "volume-a",
      "volume 3.65",
    );

    await (query.queryFn as () => Promise<unknown>)();

    expect(query.queryKey).toEqual([
      "RegionOne",
      "project-a",
      "volume",
      "volume-a",
      "volume 3.65",
    ]);
    expect(mockedOpenstack).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: "volume 3.65" }),
    );
  });

  it("includes the negotiated microversion in snapshot requests and cache keys", async () => {
    mockedOpenstack.mockResolvedValueOnce({ snapshot: { id: "snapshot-a" } });
    const query = snapshotQueryOptions(
      "RegionOne",
      "project-a",
      "snapshot-a",
      "volume 3.64",
    );

    await (query.queryFn as () => Promise<unknown>)();

    expect(query.queryKey).toEqual([
      "RegionOne",
      "project-a",
      "snapshot",
      "snapshot-a",
      "volume 3.64",
    ]);
    expect(mockedOpenstack).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: "volume 3.64" }),
    );
  });
});

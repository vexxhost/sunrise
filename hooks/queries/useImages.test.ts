import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/actions", () => ({ openstack: vi.fn() }));

import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { openstack } from "@/lib/openstack/actions";

const mockedOpenstack = vi.mocked(openstack);

describe("Glance image query options", () => {
  beforeEach(() => {
    mockedOpenstack.mockReset();
  });

  it("keeps the unfiltered request and query key unchanged", async () => {
    mockedOpenstack.mockResolvedValue({ images: [] });
    const query = imagesQueryOptions("RegionOne", "project-a");

    await expect((query.queryFn as () => Promise<unknown>)()).resolves.toEqual(
      [],
    );
    expect(query.queryKey).toEqual(["RegionOne", "project-a", "images"]);
    expect(mockedOpenstack).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v2/images" }),
    );
  });

  it("sends repeated Glance tag parameters and checks all-tag matches", async () => {
    mockedOpenstack.mockResolvedValue({
      images: [
        { id: "image-a", tags: ["env:test", "team:api"] },
        { id: "image-b", tags: ["env:test"] },
      ],
    });
    const filter = { tags: ["env:test", "team:api"] };
    const query = imagesQueryOptions("RegionOne", "project-a", filter);

    await expect((query.queryFn as () => Promise<unknown>)()).resolves.toEqual([
      expect.objectContaining({ id: "image-a" }),
    ]);
    expect(query.queryKey).toEqual([
      "RegionOne",
      "project-a",
      "images",
      "env:test",
      "team:api",
    ]);
    expect(mockedOpenstack).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2/images?tag=env%3Atest&tag=team%3Aapi",
      }),
    );
  });
});

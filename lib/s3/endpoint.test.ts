import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getServiceCatalog: vi.fn(),
  resolveServiceEndpoint: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceCatalog: mocks.getServiceCatalog,
  resolveServiceEndpoint: mocks.resolveServiceEndpoint,
}));

import { getS3Endpoint } from "@/lib/s3/endpoint";

describe("S3 endpoint resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveServiceEndpoint.mockReturnValue("https://s3.example.test");
  });

  it("reuses the scoped-token catalog during interactive login", async () => {
    const catalog = [
      {
        name: "s3",
        type: "object-storage-s3",
        endpoints: [],
      },
    ];

    await expect(
      getS3Endpoint({
        regionId: "RegionOne",
        token: "project-token",
        catalog,
      }),
    ).resolves.toBe("https://s3.example.test");

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getServiceCatalog).not.toHaveBeenCalled();
    expect(mocks.resolveServiceEndpoint).toHaveBeenCalledWith(
      catalog,
      "RegionOne",
      "object-storage-s3",
      "s3",
    );
  });
});

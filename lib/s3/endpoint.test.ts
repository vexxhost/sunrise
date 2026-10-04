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
    delete process.env.SUNRISE_DISABLED_SERVICES;
    delete process.env.SUNRISE_DISABLED_SERVICES_REGIONONE;
    process.env.SUNRISE_OBJECT_STORAGE_BACKENDS = "s3";
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

  it("rejects S3 access when the S3 backend is disabled", async () => {
    process.env.SUNRISE_DISABLED_SERVICES = "object-storage-s3";

    await expect(
      getS3Endpoint({
        regionId: "RegionOne",
        token: "project-token",
        catalog: [],
      }),
    ).rejects.toThrow("Object Storage is disabled in RegionOne");
    expect(mocks.resolveServiceEndpoint).not.toHaveBeenCalled();
  });

  it("keeps S3 available when only Swift is disabled", async () => {
    process.env.SUNRISE_DISABLED_SERVICES = "object-storage";

    await expect(
      getS3Endpoint({
        regionId: "RegionOne",
        token: "project-token",
        catalog: [],
      }),
    ).resolves.toBe("https://s3.example.test");
  });

  it("rejects S3 access when Swift wins backend selection", async () => {
    process.env.SUNRISE_OBJECT_STORAGE_BACKENDS = "swift,s3";
    mocks.resolveServiceEndpoint.mockImplementation(
      (_catalog, _region, serviceType) =>
        serviceType === "object-storage" || serviceType === "object-store"
          ? "https://swift.example.test"
          : "https://s3.example.test",
    );

    await expect(
      getS3Endpoint({
        regionId: "RegionOne",
        token: "project-token",
        catalog: [],
      }),
    ).rejects.toThrow("S3 endpoint");
  });
});

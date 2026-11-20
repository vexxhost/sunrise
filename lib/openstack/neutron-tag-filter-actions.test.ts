import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverNetworkCapabilities: vi.fn(),
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION: "standard-attr-tag",
}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: vi.fn(),
}));
vi.mock("@/lib/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/session")>();
  return { ...original, getSession: vi.fn() };
});

import { discoverNetworkCapabilities } from "@/lib/openstack/capabilities-server";
import { listProjectNeutronResourcesByTags } from "@/lib/openstack/neutron-tag-filter-actions";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession } from "@/lib/session";

const mockedCapabilities = vi.mocked(discoverNetworkCapabilities);
const mockedRequest = vi.mocked(openstackRequest);
const mockedSession = vi.mocked(getSession);

describe("Neutron tag filter actions", () => {
  beforeEach(() => {
    mockedCapabilities.mockReset();
    mockedRequest.mockReset();
    mockedSession.mockReset();
    mockedSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    } as Awaited<ReturnType<typeof getSession>>);
    mockedCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["standard-attr-tag"],
      message: "Tag support is available.",
      serviceType: "network",
    });
  });

  it("lists an allowlisted collection with an exact scoped tag filter", async () => {
    mockedRequest.mockResolvedValue({
      networks: [
        {
          id: "network-a",
          project_id: "project-a",
          tags: ["env:test", "team:platform"],
        },
        { id: "network-b", project_id: "project-b", tags: ["env:test"] },
        { id: "network-c", project_id: "project-a", tags: ["env:prod"] },
        { id: "network-d", project_id: "project-a" },
      ],
    });

    await expect(
      listProjectNeutronResourcesByTags("RegionOne", "project-a", "network", {
        mode: "all",
        tags: ["env:test", "team:platform"],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "network-a", project_id: "project-a" }),
    ]);
    expect(mockedRequest).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/networks?project_id=project-a&tags=env%3Atest%2Cteam%3Aplatform",
      errorMode: "throw",
    });
  });

  it("uses tags-any for OR matching", async () => {
    mockedRequest.mockResolvedValue({
      routers: [
        { id: "router-a", project_id: "project-a", tags: ["env:test"] },
        { id: "router-b", project_id: "project-a", tags: ["env:prod"] },
      ],
    });

    await expect(
      listProjectNeutronResourcesByTags("RegionOne", "project-a", "router", {
        mode: "any",
        tags: ["env:test", "env:staging"],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "router-a", project_id: "project-a" }),
    ]);

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/routers?project_id=project-a&tags-any=env%3Atest%2Cenv%3Astaging",
      }),
    );
  });

  it("rejects mismatched scope and unknown resources before requesting", async () => {
    await expect(
      listProjectNeutronResourcesByTags("RegionTwo", "project-a", "network", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).rejects.toThrow("region does not match");
    await expect(
      listProjectNeutronResourcesByTags("RegionOne", "project-a", "subnet", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).rejects.toThrow("supported Networking resource");
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("rejects filtering when Neutron confirms tags are unsupported", async () => {
    mockedCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
      message: "No tag extension.",
      serviceType: "network",
    });

    await expect(
      listProjectNeutronResourcesByTags("RegionOne", "project-a", "port", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).rejects.toThrow("does not advertise");
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});

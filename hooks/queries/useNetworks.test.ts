import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/actions", () => ({ openstack: vi.fn() }));
vi.mock("@/lib/openstack/neutron-address-group-actions", () => ({
  getProjectVisibleAddressGroup: vi.fn(),
  listProjectOwnedAddressGroups: vi.fn(),
  listProjectVisibleAddressGroups: vi.fn(),
}));
vi.mock("@/lib/openstack/neutron-ip-availability-actions", () => ({
  getNetworkIpAvailability: vi.fn(),
}));
vi.mock("@/lib/openstack/neutron-tag-filter-actions", () => ({
  listProjectNeutronResourcesByTags: vi.fn(),
}));

import {
  addressGroupQueryOptions,
  addressGroupsQueryOptions,
  availableNetworkZoneNames,
  isOwnedAddressGroup,
  networkIpAvailabilityQueryOptions,
  networkAvailabilityZonesQueryOptions,
  portsQueryOptions,
  projectNetworksQueryOptions,
  projectAddressGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { openstack } from "@/lib/openstack/actions";
import {
  getProjectVisibleAddressGroup,
  listProjectOwnedAddressGroups,
  listProjectVisibleAddressGroups,
} from "@/lib/openstack/neutron-address-group-actions";
import { getNetworkIpAvailability } from "@/lib/openstack/neutron-ip-availability-actions";
import { listProjectNeutronResourcesByTags } from "@/lib/openstack/neutron-tag-filter-actions";

const mockedOpenstack = vi.mocked(openstack);
const mockedGetProjectVisibleAddressGroup = vi.mocked(
  getProjectVisibleAddressGroup,
);
const mockedListProjectVisibleAddressGroups = vi.mocked(
  listProjectVisibleAddressGroups,
);
const mockedListProjectOwnedAddressGroups = vi.mocked(
  listProjectOwnedAddressGroups,
);
const mockedGetNetworkIpAvailability = vi.mocked(getNetworkIpAvailability);
const mockedListProjectNeutronResourcesByTags = vi.mocked(
  listProjectNeutronResourcesByTags,
);

describe("Neutron query options", () => {
  beforeEach(() => {
    mockedOpenstack.mockReset();
    mockedGetProjectVisibleAddressGroup.mockReset();
    mockedListProjectOwnedAddressGroups.mockReset();
    mockedListProjectVisibleAddressGroups.mockReset();
    mockedGetNetworkIpAvailability.mockReset();
    mockedListProjectNeutronResourcesByTags.mockReset();
  });

  it("loads network IP availability through the scoped action", async () => {
    mockedGetNetworkIpAvailability.mockResolvedValue({
      status: "restricted",
    });
    const query = networkIpAvailabilityQueryOptions(
      "RegionOne",
      "project-a",
      "network-a",
    );

    await expect((query.queryFn as () => Promise<unknown>)()).resolves.toEqual({
      status: "restricted",
    });
    expect(query.queryKey).toEqual([
      "RegionOne",
      "project-a",
      "network-ip-availability",
      "network-a",
    ]);
    expect(mockedGetNetworkIpAvailability).toHaveBeenCalledWith(
      "RegionOne",
      "project-a",
      "network-a",
    );
  });

  it("loads the availability-zone catalog through the constrained read action", async () => {
    mockedOpenstack.mockResolvedValue({
      availability_zones: [
        { name: "nova", resource: "network", state: "available" },
      ],
    });
    const query = networkAvailabilityZonesQueryOptions(
      "RegionOne",
      "project-a",
    );

    await expect((query.queryFn as () => Promise<unknown>)()).resolves.toEqual([
      { name: "nova", resource: "network", state: "available" },
    ]);
    expect(query.queryKey).toEqual([
      "RegionOne",
      "project-a",
      "network-availability-zones",
    ]);
    expect(mockedOpenstack).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/availability_zones",
    });
  });

  it("selects unique available zones for the requested resource", () => {
    expect(
      availableNetworkZoneNames(
        [
          { name: "nova-2", resource: "network", state: "available" },
          { name: "nova-1", resource: "network", state: "unavailable" },
          { name: "nova-2", resource: "network", state: "available" },
          { name: "nova-1", resource: "router", state: "available" },
        ],
        "network",
      ),
    ).toEqual(["nova-2"]);
  });

  it("loads visible, project-owned, and individual address groups", async () => {
    const group = {
      id: "address-group-a",
      name: "trusted",
      description: "",
      addresses: ["192.0.2.0/24"],
    };
    mockedListProjectVisibleAddressGroups.mockResolvedValue([group]);
    mockedListProjectOwnedAddressGroups.mockResolvedValue([group]);
    mockedGetProjectVisibleAddressGroup.mockResolvedValue(group);

    const collection = addressGroupsQueryOptions(
      "RegionOne",
      "project-a",
      true,
    );
    const projectCollection = projectAddressGroupsQueryOptions(
      "RegionOne",
      "project-a",
    );
    const detail = addressGroupQueryOptions(
      "RegionOne",
      "project-a",
      "address-group-a",
      true,
    );
    await expect(
      (collection.queryFn as () => Promise<unknown>)(),
    ).resolves.toEqual([
      expect.objectContaining({ id: "address-group-a", name: "trusted" }),
    ]);
    await expect(
      (projectCollection.queryFn as () => Promise<unknown>)(),
    ).resolves.toEqual([
      expect.objectContaining({ id: "address-group-a", name: "trusted" }),
    ]);
    await expect((detail.queryFn as () => Promise<unknown>)()).resolves.toEqual(
      expect.objectContaining({ id: "address-group-a", name: "trusted" }),
    );
    expect(mockedListProjectVisibleAddressGroups).toHaveBeenCalledWith(
      "RegionOne",
      "project-a",
      true,
    );
    expect(mockedListProjectOwnedAddressGroups).toHaveBeenCalledWith(
      "RegionOne",
      "project-a",
    );
    expect(mockedGetProjectVisibleAddressGroup).toHaveBeenCalledWith(
      "RegionOne",
      "project-a",
      "address-group-a",
      true,
    );
  });

  it("derives ownership from the project-filtered collection when policy omits owner fields", () => {
    const owned = {
      id: "address-group-a",
      name: "owned",
      description: "",
      addresses: [],
    };
    const shared = { ...owned, id: "address-group-b", name: "shared" };

    expect(isOwnedAddressGroup(owned, "project-a", [owned])).toBe(true);
    expect(isOwnedAddressGroup(shared, "project-a", [owned])).toBe(false);
    expect(
      isOwnedAddressGroup(
        { ...shared, project_id: "project-a" },
        "project-a",
        [],
      ),
    ).toBe(true);
    expect(
      isOwnedAddressGroup({ ...owned, project_id: "project-b" }, "project-a", [
        owned,
      ]),
    ).toBe(false);
  });

  it("loads filtered collections through the scoped tag action", async () => {
    const filter = { mode: "all" as const, tags: ["env:test"] };
    mockedListProjectNeutronResourcesByTags.mockResolvedValue([
      { id: "network-a", project_id: "project-a", name: "private" },
    ]);

    const networks = projectNetworksQueryOptions(
      "RegionOne",
      "project-a",
      filter,
    );
    await expect(
      (networks.queryFn as () => Promise<unknown>)(),
    ).resolves.toEqual([
      expect.objectContaining({ id: "network-a", name: "private" }),
    ]);
    expect(networks.queryKey).toEqual([
      "RegionOne",
      "project-a",
      "project-networks",
      "all",
      "env:test",
    ]);
    expect(mockedListProjectNeutronResourcesByTags).toHaveBeenCalledWith(
      "RegionOne",
      "project-a",
      "network",
      filter,
    );
    expect(mockedOpenstack).not.toHaveBeenCalled();
  });

  it("keeps unfiltered collection query keys and reads unchanged", async () => {
    mockedOpenstack.mockResolvedValue({ ports: [] });
    const ports = portsQueryOptions("RegionOne", "project-a");

    await expect((ports.queryFn as () => Promise<unknown>)()).resolves.toEqual(
      [],
    );
    expect(ports.queryKey).toEqual(["RegionOne", "project-a", "ports"]);
    expect(mockedListProjectNeutronResourcesByTags).not.toHaveBeenCalled();
    expect(mockedOpenstack).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/ports?project_id=project-a",
      }),
    );
  });
});

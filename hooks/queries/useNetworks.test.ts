import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/actions", () => ({ openstack: vi.fn() }));

import {
  addressGroupQueryOptions,
  addressGroupsQueryOptions,
  availableNetworkZoneNames,
  isOwnedAddressGroup,
  networkAvailabilityZonesQueryOptions,
  projectAddressGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { openstack } from "@/lib/openstack/actions";

const mockedOpenstack = vi.mocked(openstack);

describe("Neutron query options", () => {
  beforeEach(() => {
    mockedOpenstack.mockReset();
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
    mockedOpenstack
      .mockResolvedValueOnce({
        address_groups: [
          {
            id: "address-group-a",
            name: "trusted",
            addresses: ["192.0.2.0/24"],
          },
        ],
      })
      .mockResolvedValueOnce({
        address_groups: [
          {
            id: "address-group-a",
            name: "trusted",
            addresses: ["192.0.2.0/24"],
          },
        ],
      })
      .mockResolvedValueOnce({
        address_group: {
          id: "address-group-a",
          name: "trusted",
          addresses: ["192.0.2.0/24"],
        },
      });

    const collection = addressGroupsQueryOptions("RegionOne", "project-a");
    const projectCollection = projectAddressGroupsQueryOptions(
      "RegionOne",
      "project-a",
    );
    const detail = addressGroupQueryOptions(
      "RegionOne",
      "project-a",
      "address-group-a",
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
    expect(mockedOpenstack).toHaveBeenNthCalledWith(1, {
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/address-groups",
      errorMode: "throw",
    });
    expect(mockedOpenstack).toHaveBeenNthCalledWith(2, {
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/address-groups?project_id=project-a",
      errorMode: "throw",
    });
    expect(mockedOpenstack).toHaveBeenNthCalledWith(3, {
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/address-groups/address-group-a",
      errorMode: "throw",
    });
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
});

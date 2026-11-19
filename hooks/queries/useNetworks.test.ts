import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/actions", () => ({ openstack: vi.fn() }));

import {
  availableNetworkZoneNames,
  networkAvailabilityZonesQueryOptions,
  securityGroupRbacPoliciesQueryOptions,
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

  it("checks security-group sharing policies across consumer projects", async () => {
    mockedOpenstack.mockResolvedValue({
      rbac_policies: [
        {
          id: "policy-a",
          action: "access_as_shared",
          object_id: "group-a",
          object_type: "security_group",
          project_id: "project-a",
          target_tenant: "project-b",
          tenant_id: "project-a",
        },
      ],
    });
    const query = securityGroupRbacPoliciesQueryOptions(
      "RegionOne",
      "project-a",
      "group-a",
    );

    await expect((query.queryFn as () => Promise<unknown>)()).resolves.toEqual([
      expect.objectContaining({ id: "policy-a" }),
    ]);
    expect(query.queryKey).toEqual([
      "RegionOne",
      "project-a",
      "security-group",
      "group-a",
      "rbac-policies",
    ]);
    expect(mockedOpenstack).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/rbac-policies?action=access_as_shared&object_id=group-a&object_type=security_group&project_id=project-a",
      errorMode: "throw",
    });
  });
});

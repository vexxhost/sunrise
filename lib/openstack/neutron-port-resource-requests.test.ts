import { describe, expect, it } from "vitest";

import {
  inspectNeutronPortResourceRequest,
  neutronPortIpAllocationLabel,
  normalizeNeutronPortResourceRequest,
} from "@/lib/openstack/neutron-port-resource-requests";

describe("Neutron port resource requests", () => {
  it("normalizes the legacy single-group format", () => {
    expect(
      normalizeNeutronPortResourceRequest({
        required: ["CUSTOM_PHYSNET_PUBLIC"],
        resources: { NET_BW_EGR_KILOBIT_PER_SEC: 2_000 },
      }),
    ).toEqual({
      groups: [
        {
          required: ["CUSTOM_PHYSNET_PUBLIC"],
          resources: [
            {
              amount: 2_000,
              resourceClass: "NET_BW_EGR_KILOBIT_PER_SEC",
            },
          ],
        },
      ],
      sameSubtree: [],
    });
  });

  it("normalizes grouped resource requests and same-subtree constraints", () => {
    expect(
      normalizeNeutronPortResourceRequest({
        request_groups: [
          {
            id: "group-a",
            required: ["CUSTOM_VNIC_TYPE_NORMAL"],
            resources: { NET_PACKET_RATE_KILOPACKET_PER_SEC: 1_000 },
          },
          {
            id: "group-b",
            required: [],
            resources: { NET_BW_EGR_KILOBIT_PER_SEC: 2_000 },
          },
        ],
        same_subtree: ["group-a", "group-b"],
      }),
    ).toEqual({
      groups: [
        {
          id: "group-a",
          required: ["CUSTOM_VNIC_TYPE_NORMAL"],
          resources: [
            {
              amount: 1_000,
              resourceClass: "NET_PACKET_RATE_KILOPACKET_PER_SEC",
            },
          ],
        },
        {
          id: "group-b",
          required: [],
          resources: [
            {
              amount: 2_000,
              resourceClass: "NET_BW_EGR_KILOBIT_PER_SEC",
            },
          ],
        },
      ],
      sameSubtree: ["group-a", "group-b"],
    });
  });

  it("ignores malformed and empty requests", () => {
    expect(normalizeNeutronPortResourceRequest(null)).toBeNull();
    expect(normalizeNeutronPortResourceRequest({})).toBeNull();
    expect(
      normalizeNeutronPortResourceRequest({
        request_groups: [{ resources: { INVALID: "1" } }],
      }),
    ).toBeNull();
  });

  it("distinguishes a policy-hidden field from a reported empty request", () => {
    expect(inspectNeutronPortResourceRequest({})).toEqual({
      reported: false,
      request: null,
    });
    expect(
      inspectNeutronPortResourceRequest({ resource_request: null }),
    ).toEqual({
      reported: true,
      request: null,
    });
  });

  it("inspects a reported resource request", () => {
    expect(
      inspectNeutronPortResourceRequest({
        resource_request: {
          required: ["CUSTOM_PHYSNET_PUBLIC"],
          resources: { NET_BW_EGR_KILOBIT_PER_SEC: 2_000 },
        },
      }),
    ).toMatchObject({
      reported: true,
      request: {
        groups: [
          {
            required: ["CUSTOM_PHYSNET_PUBLIC"],
            resources: [
              {
                amount: 2_000,
                resourceClass: "NET_BW_EGR_KILOBIT_PER_SEC",
              },
            ],
          },
        ],
      },
    });
  });

  it("labels known allocation states while preserving future values", () => {
    expect(neutronPortIpAllocationLabel("immediate")).toBe("Immediate");
    expect(neutronPortIpAllocationLabel("deferred")).toBe(
      "Deferred until the port is bound",
    );
    expect(neutronPortIpAllocationLabel("none")).toBe("No IP allocation");
    expect(neutronPortIpAllocationLabel("future")).toBe("future");
  });
});

import { describe, expect, it } from "vitest";

import {
  canRemoveRouterExternalGateway,
  routerExternalGatewayKey,
  routerExternalGateways,
} from "@/lib/openstack/neutron-router-gateways";
import type { RouterExternalGatewayInfo } from "@/types/openstack";

function gateway(
  networkId: string,
  ipAddress?: string,
): RouterExternalGatewayInfo {
  return {
    network_id: networkId,
    enable_snat: false,
    external_fixed_ips: ipAddress
      ? [{ subnet_id: "subnet-a", ip_address: ipAddress }]
      : [],
  };
}

describe("router external gateway helpers", () => {
  it("prefers the authoritative multihoming list over the legacy gateway", () => {
    const legacyGateway = gateway("legacy");
    const router = {
      external_gateway_info: legacyGateway,
      external_gateways: [],
    };

    expect(routerExternalGateways(router)).toEqual([]);
    expect(
      routerExternalGateways({
        external_gateway_info: legacyGateway,
      }),
    ).toEqual([legacyGateway]);
  });

  it("allows network-only removal only for a unique unaddressed gateway", () => {
    const unaddressed = gateway("external-a");
    const addressed = gateway("external-a", "203.0.113.10");

    expect(canRemoveRouterExternalGateway(unaddressed, [unaddressed])).toBe(
      true,
    );
    expect(
      canRemoveRouterExternalGateway(unaddressed, [unaddressed, addressed]),
    ).toBe(false);
    expect(
      canRemoveRouterExternalGateway(addressed, [unaddressed, addressed]),
    ).toBe(true);
  });

  it("keeps unaddressed same-network gateway keys distinct", () => {
    const unaddressed = gateway("external-a");

    expect(routerExternalGatewayKey(unaddressed, 0)).not.toBe(
      routerExternalGatewayKey(unaddressed, 1),
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  canRemoveRouterExternalGateway,
  routerCapabilityBooleanInput,
  routerExternalGatewayKey,
  routerExternalGatewayMultihomingAvailable,
  routerExternalGateways,
} from "@/lib/openstack/neutron-router-gateways";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
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

function support(
  status: OpenStackFeatureSupport["status"],
): OpenStackFeatureSupport {
  return { status, message: "" };
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

  it("sends explicit false only when optional routing support is confirmed", () => {
    expect(routerCapabilityBooleanInput(support("supported"), false)).toBe(
      false,
    );
    expect(routerCapabilityBooleanInput(support("supported"), true)).toBe(true);
    expect(routerCapabilityBooleanInput(support("unknown"), false)).toBe(
      undefined,
    );
    expect(routerCapabilityBooleanInput(support("unknown"), true)).toBe(true);
    expect(routerCapabilityBooleanInput(support("unsupported"), true)).toBe(
      undefined,
    );
  });

  it("uses multihoming mode only when confirmed or present in router data", () => {
    expect(
      routerExternalGatewayMultihomingAvailable(
        { external_gateways: undefined },
        support("supported"),
      ),
    ).toBe(true);
    expect(
      routerExternalGatewayMultihomingAvailable(
        { external_gateways: undefined },
        support("unknown"),
      ),
    ).toBe(false);
    expect(
      routerExternalGatewayMultihomingAvailable(
        { external_gateways: [] },
        support("unknown"),
      ),
    ).toBe(true);
    expect(
      routerExternalGatewayMultihomingAvailable(
        { external_gateways: [] },
        support("unsupported"),
      ),
    ).toBe(true);
  });
});

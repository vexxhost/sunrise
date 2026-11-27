import { describe, expect, it } from "vitest";
import {
  availableListenerProtocols,
  octaviaTlsSecretId,
  listenerCidrError,
  listenerParentReadApiVersion,
  listenerReadApiVersion,
  listenerSettingUnavailable,
  sameListenerCidrs,
} from "@/lib/openstack/octavia-listener-settings";

const capabilities = {
  discoveryStatus: "available" as const,
  message: "",
  serviceType: "load-balancer",
  microversions: { minimum: "2.0", maximum: "2.28" },
};
const parent = {
  provider: "amphorav2",
  vip_address: "192.0.2.10",
  additional_vips: [{ subnet_id: "ipv6", ip_address: "2001:db8::1" }],
};

describe("Octavia listener capability rules", () => {
  it("uses both the provider and the operational API ceiling", () => {
    expect(availableListenerProtocols("amphorav2", capabilities)).toEqual([
      "HTTP",
      "TCP",
      "HTTPS",
      "UDP",
      "TERMINATED_HTTPS",
    ]);
    expect(availableListenerProtocols("ovn", capabilities)).toEqual([
      "TCP",
      "UDP",
    ]);
    expect(availableListenerProtocols("unknown", capabilities)).toEqual([
      "TCP",
    ]);
    expect(
      availableListenerProtocols("amphora", {
        ...capabilities,
        configuredMicroversionMaximum: "2.0",
      }),
    ).toEqual(["HTTP", "TCP", "HTTPS", "TERMINATED_HTTPS"]);
    expect(
      availableListenerProtocols("amphora", {
        ...capabilities,
        discoveryStatus: "unavailable",
      }),
    ).not.toContain("UDP");
  });

  it("recognizes Barbican secret URLs, including prefixed endpoints", () => {
    const id = "612b9ffa-fbc9-42ea-a78f-600c003c5103";
    expect(
      octaviaTlsSecretId(`https://example.test/barbican/v1/secrets/${id}`),
    ).toBe(id);
    for (const ref of [
      `https://example.test/v1/containers/${id}`,
      `https://example.test/v1/secrets/${id}/payload`,
      `https://example.test/v1/secrets/${id}?token=1`,
      `https://user:pass@example.test/v1/secrets/${id}`,
      `ftp://example.test/v1/secrets/${id}`,
      id,
      null,
    ])
      expect(octaviaTlsSecretId(ref)).toBeNull();
  });

  it("negotiates optional fields separately from the parent VIP data", () => {
    expect(listenerReadApiVersion(capabilities)).toBe("load-balancer 2.12");
    expect(listenerParentReadApiVersion(capabilities)).toBe(
      "load-balancer 2.26",
    );
    expect(
      listenerReadApiVersion({
        ...capabilities,
        configuredMicroversionMaximum: "2.11",
      }),
    ).toBe("load-balancer 2.1");
    expect(
      listenerParentReadApiVersion({
        ...capabilities,
        configuredMicroversionMaximum: "2.11",
      }),
    ).toBeUndefined();
  });

  it("does not offer the Amphora controls on OVN or timeouts for UDP", () => {
    expect(
      listenerSettingUnavailable(
        "connection_limit",
        { ...parent, provider: "ovn" },
        "TCP",
        capabilities,
      ),
    ).toContain("provider");
    expect(
      listenerSettingUnavailable(
        "timeout_tcp_inspect",
        parent,
        "UDP",
        capabilities,
      ),
    ).toContain("protocol");
    expect(
      listenerSettingUnavailable("allowed_cidrs", parent, "UDP", capabilities),
    ).toBeNull();
  });

  it("allows clearing an old allowlist but not adding one with custom VIP security groups", () => {
    const customVip = { ...parent, vip_sg_ids: ["custom-sg"] };
    expect(
      listenerSettingUnavailable(
        "allowed_cidrs",
        customVip,
        "TCP",
        capabilities,
        ["192.0.2.0/24"],
      ),
    ).toContain("security groups");
    expect(
      listenerSettingUnavailable(
        "allowed_cidrs",
        customVip,
        "TCP",
        capabilities,
        [],
      ),
    ).toBeNull();
  });

  it("validates each CIDR family, syntax, and uniqueness", () => {
    const cidrs = ["192.0.2.0/24", "2001:db8::/64"];
    expect(listenerCidrError(cidrs, parent)).toBeNull();
    expect(
      listenerCidrError(cidrs, { ...parent, additional_vips: [] }),
    ).toContain("IP version");
    expect(listenerCidrError(["192.0.2.1"], parent)).toContain("valid");
    expect(listenerCidrError(["192.0.2.0 /24"], parent)).toContain("valid");
    expect(listenerCidrError(["192.0.2.0/33"], parent)).toContain("valid");
    expect(listenerCidrError([cidrs[0], cidrs[0]], parent)).toContain(
      "duplicate",
    );
    expect(sameListenerCidrs(cidrs, [cidrs[1], cidrs[0]])).toBe(true);
  });
});

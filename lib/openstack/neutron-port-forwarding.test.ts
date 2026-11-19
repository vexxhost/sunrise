import { describe, expect, it } from "vitest";

import {
  buildPortForwardingPortMapping,
  parsePortForwardingPortRange,
  portForwardingExternalPorts,
  portForwardingInternalPorts,
} from "@/lib/openstack/neutron-port-forwarding";

describe("Neutron floating IP port forwarding", () => {
  it("uses singular fields for one-to-one port mappings", () => {
    expect(
      buildPortForwardingPortMapping({
        externalStart: 443,
        internalStart: 8443,
      }),
    ).toEqual({
      ok: true,
      value: { externalPort: 443, internalPort: 8443 },
    });
  });

  it("maps equally sized ranges", () => {
    expect(
      buildPortForwardingPortMapping({
        externalStart: 8_000,
        externalEnd: 8_010,
        internalStart: 9_000,
        internalEnd: 9_010,
      }),
    ).toEqual({
      ok: true,
      value: {
        externalPortRange: "8000:8010",
        internalPortRange: "9000:9010",
      },
    });
  });

  it("maps a public range to one internal port", () => {
    expect(
      buildPortForwardingPortMapping({
        externalStart: 8_000,
        externalEnd: 8_010,
        internalStart: 9_000,
      }),
    ).toEqual({
      ok: true,
      value: {
        externalPortRange: "8000:8010",
        internalPortRange: "9000",
      },
    });
  });

  it("rejects unsupported range relationships", () => {
    expect(
      buildPortForwardingPortMapping({
        externalStart: 8_000,
        externalEnd: 8_005,
        internalStart: 9_000,
        internalEnd: 9_002,
      }),
    ).toEqual({
      ok: false,
      error:
        "Use matching public and internal range sizes, or map a public range to one internal port.",
    });
  });

  it("rejects invalid port boundaries", () => {
    expect(
      buildPortForwardingPortMapping({
        externalStart: 0,
        internalStart: 80,
      }),
    ).toEqual({
      ok: false,
      error: "Ports must be whole numbers between 1 and 65535.",
    });
    expect(
      buildPortForwardingPortMapping({
        externalStart: 90,
        externalEnd: 80,
        internalStart: 8080,
      }),
    ).toEqual({
      ok: false,
      error: "A port range cannot end before it starts.",
    });
  });

  it("formats and parses singular and ranged response fields", () => {
    expect(parsePortForwardingPortRange("80")).toEqual({ start: 80, end: 80 });
    expect(parsePortForwardingPortRange("8000:8010")).toEqual({
      start: 8_000,
      end: 8_010,
    });
    expect(parsePortForwardingPortRange("invalid")).toBeNull();
    expect(
      portForwardingExternalPorts({
        id: "rule-a",
        internal_port_id: "port-a",
        internal_ip_address: "10.0.0.5",
        internal_port: 80,
        external_port_range: "8000:8010",
        protocol: "tcp",
      }),
    ).toBe("8000:8010");
    expect(
      portForwardingInternalPorts({
        id: "rule-a",
        internal_port_id: "port-a",
        internal_ip_address: "10.0.0.5",
        internal_port: 80,
        external_port: 8080,
        protocol: "tcp",
      }),
    ).toBe("80");
  });
});

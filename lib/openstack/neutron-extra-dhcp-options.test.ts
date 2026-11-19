import { describe, expect, it } from "vitest";

import {
  diffExtraDhcpOptions,
  portExtraDhcpOptionInputs,
} from "@/lib/openstack/neutron-extra-dhcp-options";

describe("Neutron extra DHCP option helpers", () => {
  it("normalizes an omitted IP version to Neutron's IPv4 default", () => {
    expect(
      portExtraDhcpOptionInputs([
        { opt_name: "bootfile-name", opt_value: "pxelinux.0" },
      ]),
    ).toEqual([
      {
        ipVersion: 4,
        optName: "bootfile-name",
        optValue: "pxelinux.0",
      },
    ]);
  });

  it("builds patch-like updates with explicit removals", () => {
    const original = [
      { ipVersion: 4 as const, optName: "bootfile-name", optValue: "old" },
      { ipVersion: 4 as const, optName: "tftp-server", optValue: "192.0.2.2" },
      { ipVersion: 6 as const, optName: "dns-server", optValue: "2001:db8::1" },
    ];
    const current = [
      { ipVersion: 4 as const, optName: "bootfile-name", optValue: "new" },
      { ipVersion: 6 as const, optName: "dns-server", optValue: "2001:db8::1" },
      { ipVersion: 6 as const, optName: "domain-search", optValue: "example.org" },
    ];

    expect(diffExtraDhcpOptions(current, original)).toEqual([
      { ipVersion: 4, optName: "tftp-server", optValue: null },
      { ipVersion: 4, optName: "bootfile-name", optValue: "new" },
      { ipVersion: 6, optName: "domain-search", optValue: "example.org" },
    ]);
  });

  it("omits an unchanged update", () => {
    const options = [
      { ipVersion: 4 as const, optName: "bootfile-name", optValue: "pxelinux.0" },
    ];

    expect(diffExtraDhcpOptions(options, options)).toBeUndefined();
  });

  it("compares the same trimmed values that the mutation schema sends", () => {
    expect(
      diffExtraDhcpOptions(
        [
          {
            ipVersion: 4,
            optName: " bootfile-name ",
            optValue: " pxelinux.0 ",
          },
        ],
        [
          {
            ipVersion: 4,
            optName: "bootfile-name",
            optValue: "pxelinux.0",
          },
        ],
      ),
    ).toBeUndefined();
  });
});

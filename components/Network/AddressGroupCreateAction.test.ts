import { describe, expect, it } from "vitest";

import {
  addressListIssues,
  addressesFromText,
} from "@/components/Network/AddressGroupCreateAction";

describe("address group input", () => {
  it("parses newline and comma separated addresses", () => {
    expect(
      addressesFromText(" 192.0.2.10, 198.51.100.0/24\n\n2001:db8::/64 "),
    ).toEqual(["192.0.2.10", "198.51.100.0/24", "2001:db8::/64"]);
  });

  it("accepts IPv4 and IPv6 addresses and CIDRs", () => {
    expect(
      addressListIssues([
        "192.0.2.10",
        "198.51.100.0/24",
        "2001:db8::1",
        "2001:db8::/64",
      ]),
    ).toEqual([]);
  });

  it("rejects malformed and duplicate address lists", () => {
    expect(addressListIssues(["192.0.2.0/33"])).toEqual([
      "Invalid CIDR: 192.0.2.0/33",
    ]);
    expect(addressListIssues(["2001:db8::/129"])).toEqual([
      "Invalid CIDR: 2001:db8::/129",
    ]);
    expect(addressListIssues(["not-an-address"])).toEqual([
      "Invalid address: not-an-address",
    ]);
    expect(addressListIssues(["2001:DB8::/64", "2001:db8::/64"])).toEqual([
      "Remove duplicate address entries.",
    ]);
  });
});

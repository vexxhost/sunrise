import { describe, expect, it } from "vitest";
import type { MutationErrorCode } from "@/lib/mutations";
import {
  formatOctaviaMemberMonitor,
  poolMutationRecovery,
} from "./octavia-pool-settings";

describe("member health check endpoint", () => {
  const member = { address: "2001:db8::1", protocol_port: 80 };

  it("formats IPv6 and falls back only for explicit defaults", () => {
    expect(
      formatOctaviaMemberMonitor({
        ...member,
        monitor_address: null,
        monitor_port: 8080,
      }),
    ).toBe("[2001:db8::1]:8080");
    expect(
      formatOctaviaMemberMonitor({
        ...member,
        monitor_address: "2001:db8::2",
        monitor_port: null,
      }),
    ).toBe("[2001:db8::2]:80");
    expect(formatOctaviaMemberMonitor({ ...member, monitor_port: 8080 })).toBe(
      "port 8080",
    );
    expect(
      formatOctaviaMemberMonitor({
        ...member,
        monitor_address: null,
        monitor_port: null,
      }),
    ).toBeNull();
    expect(formatOctaviaMemberMonitor(member)).toBeNull();
  });
});

describe("pool mutation recovery", () => {
  it.each([
    ["conflict", false, true, true],
    ["conflict", true, true, false],
    ["not-found", true, true, true],
    ["invalid-response", true, true, true],
    ["network-error", false, true, true],
    ["context-changed", false, false, true],
    ["validation-failed", false, false, false],
  ] as const satisfies readonly (readonly [
    MutationErrorCode,
    boolean,
    boolean,
    boolean,
  ])[])(
    "refreshes or locks the dialog after %s (retain draft on conflict: %s)",
    (code, retainDraft, needsRefresh, needsReopen) => {
      expect(poolMutationRecovery(code, retainDraft)).toEqual({
        needsRefresh,
        needsReopen,
      });
    },
  );
});

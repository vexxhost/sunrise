import { afterEach, describe, expect, it } from "vitest";
import {
  mergeStoredSession,
  storedSessionTtlSeconds,
} from "@/lib/session-store";
import type { SunriseSession } from "@/lib/session";

const originalIdleTimeout = process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS;
const originalAbsoluteTimeout =
  process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS;

afterEach(() => {
  process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = originalIdleTimeout;
  process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS =
    originalAbsoluteTimeout;
});

describe("Redis session storage", () => {
  it("merges only fields changed by a concurrent request", () => {
    const current: SunriseSession = {
      projectId: "project-newer",
      regionId: "RegionOne",
      keystoneProjectToken: "token-current",
    };
    const requestSnapshot: SunriseSession = {
      projectId: "project-older",
      regionId: "RegionTwo",
      keystoneProjectToken: undefined,
    };

    expect(
      mergeStoredSession(
        current,
        requestSnapshot,
        new Set(["regionId", "keystoneProjectToken"]),
        new Set(["keystoneProjectToken"]),
      ),
    ).toEqual({
      projectId: "project-newer",
      regionId: "RegionTwo",
    });
  });

  it("bounds stored data by the absolute session lifetime", () => {
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "60";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "600";
    const now = 1_000_000;

    expect(
      storedSessionTtlSeconds({ sessionSignedInAt: now - 125_000 }, now),
    ).toBe(475);
    expect(storedSessionTtlSeconds({}, now)).toBe(600);
    expect(
      storedSessionTtlSeconds({ sessionSignedInAt: now - 700_000 }, now),
    ).toBe(1);
  });

  it("keeps abandoned pre-authentication sessions short-lived", () => {
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "600";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "3600";

    expect(storedSessionTtlSeconds({})).toBe(600);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS,
  getSessionLifetimePolicy,
  getSessionLifetimeState,
} from "@/lib/session-lifetime";

const originalIdle = process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS;
const originalAbsolute = process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS;

describe("Sunrise session lifetime policy", () => {
  afterEach(() => {
    if (originalIdle === undefined) {
      delete process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS;
    } else {
      process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = originalIdle;
    }
    if (originalAbsolute === undefined) {
      delete process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS;
    } else {
      process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = originalAbsolute;
    }
  });

  it("uses deliberate workday defaults", () => {
    delete process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS;
    delete process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS;

    expect(getSessionLifetimePolicy()).toMatchObject({
      idleTimeoutSeconds: DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS,
      absoluteTimeoutSeconds: DEFAULT_SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    });
  });

  it("accepts configurable idle and absolute limits", () => {
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "900";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "14400";

    expect(getSessionLifetimePolicy()).toMatchObject({
      idleTimeoutMs: 900_000,
      absoluteTimeoutMs: 14_400_000,
    });
  });

  it("rejects an idle limit longer than the absolute limit", () => {
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "7200";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "3600";

    expect(() => getSessionLifetimePolicy()).toThrow(
      "SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS cannot exceed SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS",
    );
  });

  it("distinguishes active, idle-expired, and absolute-expired sessions", () => {
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "900";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "3600";
    const signedInAt = 1_000_000;

    expect(
      getSessionLifetimeState(
        { sessionSignedInAt: signedInAt, sessionLastActivityAt: signedInAt },
        signedInAt + 899_999,
      ).status,
    ).toBe("active");
    expect(
      getSessionLifetimeState(
        { sessionSignedInAt: signedInAt, sessionLastActivityAt: signedInAt },
        signedInAt + 900_000,
      ),
    ).toMatchObject({ status: "expired", reason: "idle" });
    expect(
      getSessionLifetimeState(
        {
          sessionSignedInAt: signedInAt,
          sessionLastActivityAt: signedInAt + 3_500_000,
        },
        signedInAt + 3_600_000,
      ),
    ).toMatchObject({ status: "expired", reason: "absolute" });
  });

  it("does not silently grandfather authenticated sessions without timestamps", () => {
    expect(getSessionLifetimeState({})).toEqual({
      status: "uninitialized",
      reason: "policy",
    });
  });
});

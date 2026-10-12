import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: {},
  cookies: vi.fn(),
  getIronSession: vi.fn(),
  mainSession: {} as Record<string, any>,
  activitySession: {} as Record<string, any>,
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("iron-session", () => ({ getIronSession: mocks.getIronSession }));

import {
  getSession,
  isS3StsCredentialFresh,
  prepareSessionLifetime,
  saveSessionActivity,
} from "@/lib/session";

describe("Sunrise session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS;
    delete process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS;
    process.env.SUNRISE_SESSION_SECRET =
      "test-session-secret-at-least-32-characters";
    mocks.mainSession = {};
    mocks.activitySession = {
      save: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
    mocks.getIronSession.mockImplementation(
      (_store: unknown, options: { cookieName: string }) =>
        Promise.resolve(
          options.cookieName === "sunrise"
            ? mocks.mainSession
            : mocks.activitySession,
        ),
    );
  });

  it("uses explicit encrypted cookie settings for the cloud session", async () => {
    await getSession();

    expect(mocks.getIronSession).toHaveBeenCalledWith(
      mocks.cookieStore,
      expect.objectContaining({
        cookieName: "sunrise",
        password: "test-session-secret-at-least-32-characters",
        ttl: 28_860,
        chunk: true,
        cookieOptions: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
          maxAge: 28_800,
        },
      }),
    );
  });

  it("reads activity only from a matching isolated activity cookie", async () => {
    const now = Date.now();
    mocks.mainSession = {
      oidcIdentity: { preferredUsername: "tadas" },
      sessionId: "session-1",
      sessionSignedInAt: now - 1_000,
    };
    mocks.activitySession = {
      sessionId: "session-1",
      lastActivityAt: now - 500,
    };

    const session = await getSession();

    expect(session.sessionLastActivityAt).toBe(now - 500);
    expect(session.sessionExpiryReason).toBeUndefined();
    expect(mocks.getIronSession).toHaveBeenCalledTimes(2);
  });

  it("denies renewable credentials after the idle limit", async () => {
    const now = Date.now();
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "60";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "600";
    mocks.mainSession = {
      oidcIdentity: { preferredUsername: "tadas" },
      keycloakRefreshToken: "keycloak-refresh",
      keystone_unscoped_token: "unscoped",
      keystoneProjectToken: "scoped",
      s3Credentials: { project: {} },
      sessionId: "session-1",
      sessionSignedInAt: now - 120_000,
    };
    mocks.activitySession = {
      sessionId: "session-1",
      lastActivityAt: now - 61_000,
    };

    const session = await getSession();

    expect(session.sessionExpiryReason).toBe("idle");
    expect(session.keycloakRefreshToken).toBeUndefined();
    expect(session.keystone_unscoped_token).toBeUndefined();
    expect(session.keystoneProjectToken).toBeUndefined();
    expect(session.s3Credentials).toBeUndefined();
  });

  it("retains expired credentials only for controlled logout flows", async () => {
    const now = Date.now();
    mocks.mainSession = {
      oidcIdentity: { preferredUsername: "tadas" },
      keycloakRefreshToken: "keycloak-refresh",
      sessionId: "session-1",
      sessionSignedInAt: now - 9 * 60 * 60_000,
    };
    mocks.activitySession = {
      sessionId: "session-1",
      lastActivityAt: now,
    };

    const session = await getSession({ allowExpired: true });

    expect(session.sessionExpiryReason).toBe("absolute");
    expect(session.keycloakRefreshToken).toBe("keycloak-refresh");
  });

  it("prepares a lifetime without publishing activity", async () => {
    const now = 1_000_000;

    const activity = await prepareSessionLifetime(
      mocks.mainSession as never,
      now,
    );

    expect(mocks.mainSession.sessionId).toEqual(expect.any(String));
    expect(mocks.mainSession.sessionSignedInAt).toBe(now);
    expect(mocks.mainSession.sessionLastActivityAt).toBe(now);
    expect(activity).toEqual({
      sessionId: mocks.mainSession.sessionId,
      lastActivityAt: now,
    });
    expect(mocks.getIronSession).not.toHaveBeenCalled();
    expect(mocks.activitySession.save).not.toHaveBeenCalled();
  });

  it("updates activity without loading or saving the main session", async () => {
    await saveSessionActivity("session-1", 1_000_000);

    expect(mocks.getIronSession).toHaveBeenCalledOnce();
    expect(mocks.activitySession).toMatchObject({
      sessionId: "session-1",
      lastActivityAt: 1_000_000,
    });
  });

  it("renews STS credentials five minutes before their hard expiry", () => {
    const credentials = {
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token",
      projectId: "project-id",
      expiration: Date.now() + 4 * 60_000,
    };

    expect(isS3StsCredentialFresh(credentials)).toBe(false);
    expect(
      isS3StsCredentialFresh({
        ...credentials,
        expiration: Date.now() + 6 * 60_000,
      }),
    ).toBe(true);
  });
});

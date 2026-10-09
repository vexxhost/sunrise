import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.SUNRISE_DASHBOARD_URL = "https://sunrise.example.test";
  return {
    getSession: vi.fn(),
    prepareSessionLifetime: vi.fn(),
    saveSessionActivity: vi.fn(),
    finalizeKeystoneSession: vi.fn(),
    saveRedisSession: vi.fn(),
  };
});

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  prepareSessionLifetime: mocks.prepareSessionLifetime,
  saveSessionActivity: mocks.saveSessionActivity,
}));
vi.mock("@/lib/keystone/login", () => ({
  finalizeKeystoneSession: mocks.finalizeKeystoneSession,
  KeystoneSessionSetupError: class KeystoneSessionSetupError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
    }
  },
}));
vi.mock("@/lib/session-store", () => ({
  saveRedisSession: mocks.saveRedisSession,
}));

import { KeystoneSessionSetupError } from "@/lib/keystone/login";
import { StoredSessionSupersededError } from "@/lib/session-errors";
import { POST } from "./route";

function request() {
  return new Request("https://sunrise.example.test/auth/websso", {
    method: "POST",
    body: new URLSearchParams({ token: "unscoped-token" }),
  });
}

function invalidRequest() {
  return new Request("https://sunrise.example.test/auth/websso", {
    method: "POST",
    body: new URLSearchParams(),
  });
}

describe("legacy WebSSO recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prepareSessionLifetime.mockImplementation(async (session) => {
      session.sessionId = "session-1";
      session.sessionSignedInAt = 1_000;
      return { sessionId: "session-1", lastActivityAt: 1_000 };
    });
    mocks.saveSessionActivity.mockResolvedValue(undefined);
    mocks.saveRedisSession.mockImplementation(async (current) =>
      current.save(),
    );
  });

  it("redirects no-project identities into the recovery experience", async () => {
    const session = { save: vi.fn().mockResolvedValue(undefined) };
    mocks.getSession.mockResolvedValue(session);
    mocks.finalizeKeystoneSession.mockResolvedValue({ status: "no-projects" });

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(session).toMatchObject({ authRecovery: { reason: "no-projects" } });
    expect(session.save).toHaveBeenCalledOnce();
    expect(mocks.prepareSessionLifetime).toHaveBeenCalledWith(session);
    expect(mocks.saveSessionActivity).toHaveBeenCalledWith(
      "session-1",
      1_000,
    );
    expect(session.save.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveSessionActivity.mock.invocationCallOrder[0],
    );
  });

  it("preserves an access-denied failure for the recovery screen", async () => {
    const session = { save: vi.fn().mockResolvedValue(undefined) };
    mocks.getSession.mockResolvedValue(session);
    mocks.finalizeKeystoneSession.mockRejectedValue(
      new KeystoneSessionSetupError(
        "access-denied",
        "Project discovery denied",
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(session).toMatchObject({
      authRecovery: { reason: "access-denied" },
    });
    expect(session.save).toHaveBeenCalledOnce();
  });

  it("does not save recovery state through a superseded login boundary", async () => {
    const superseded = new StoredSessionSupersededError("superseded");
    const session = { save: vi.fn() };
    mocks.getSession.mockResolvedValue(session);
    mocks.prepareSessionLifetime.mockRejectedValue(superseded);

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(session.save).not.toHaveBeenCalled();
    expect(mocks.finalizeKeystoneSession).not.toHaveBeenCalled();
    expect(mocks.saveSessionActivity).not.toHaveBeenCalled();
  });

  it("redirects when the final session save was superseded", async () => {
    const superseded = new StoredSessionSupersededError("superseded");
    const session = { save: vi.fn().mockRejectedValue(superseded) };
    mocks.getSession.mockResolvedValue(session);
    mocks.finalizeKeystoneSession.mockResolvedValue({ status: "ready" });

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(session.save).toHaveBeenCalledOnce();
    expect(mocks.saveSessionActivity).not.toHaveBeenCalled();
  });

  it("does not merge credentials into a successor changed after rotation", async () => {
    const session = { save: vi.fn() };
    mocks.getSession.mockResolvedValue(session);
    mocks.finalizeKeystoneSession.mockResolvedValue({ status: "ready" });
    mocks.saveRedisSession.mockImplementation(async (_current, options) => {
      options.validateConflictRetry({ oidcFlowId: "newer-login-flow" });
    });

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(session.save).not.toHaveBeenCalled();
    expect(mocks.finalizeKeystoneSession).toHaveBeenCalledOnce();
    expect(mocks.saveSessionActivity).not.toHaveBeenCalled();
  });

  it("does not merge invalid-response cleanup into a newer session", async () => {
    const session = {
      keystoneProjectToken: "older-token",
      projectId: "older-project",
      regionId: "RegionOne",
      save: vi.fn(),
    };
    mocks.getSession.mockResolvedValue(session);
    mocks.saveRedisSession.mockImplementation(async (_current, options) => {
      options.validateConflictRetry({
        keystoneProjectToken: "newer-token",
        projectId: "newer-project",
      });
    });

    const response = await POST(invalidRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(session.save).not.toHaveBeenCalled();
    expect(mocks.finalizeKeystoneSession).not.toHaveBeenCalled();
  });
});

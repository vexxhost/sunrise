import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasAuthenticatedSession: vi.fn(),
  saveSessionActivity: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  hasAuthenticatedSession: mocks.hasAuthenticatedSession,
  saveSessionActivity: mocks.saveSessionActivity,
}));

import { GET, POST } from "./route";

function activeSession() {
  const now = Date.now();
  return {
    sessionId: "session-1",
    sessionSignedInAt: now - 1_000,
    sessionLastActivityAt: now - 500,
  };
}

describe("session activity route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasAuthenticatedSession.mockReturnValue(true);
    mocks.saveSessionActivity.mockResolvedValue(undefined);
  });

  it("touches only the isolated activity session", async () => {
    const session = activeSession();
    mocks.getSession.mockResolvedValue(session);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "active",
      sessionId: "session-1",
      signedInAt: session.sessionSignedInAt,
    });
    expect(mocks.getSession).toHaveBeenCalledWith({ allowExpired: true });
    expect(mocks.saveSessionActivity).toHaveBeenCalledWith(
      "session-1",
      expect.any(Number),
    );
  });

  it("rejects an idle session without touching its activity", async () => {
    const now = Date.now();
    mocks.getSession.mockResolvedValue({
      sessionId: "session-1",
      sessionSignedInAt: now - 60 * 60_000,
      sessionLastActivityAt: now - 31 * 60_000,
    });

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      status: "expired",
      reason: "idle",
    });
    expect(mocks.saveSessionActivity).not.toHaveBeenCalled();
  });

  it("checks an active deadline without extending it", async () => {
    const session = activeSession();
    mocks.getSession.mockResolvedValue(session);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lastActivityAt).toBe(session.sessionLastActivityAt);
    expect(mocks.saveSessionActivity).not.toHaveBeenCalled();
  });

  it("rejects sessions missing the policy timestamps", async () => {
    mocks.getSession.mockResolvedValue({ sessionId: "session-1" });

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      status: "expired",
      reason: "policy",
    });
  });

  it("rejects requests without an authenticated session", async () => {
    mocks.getSession.mockResolvedValue({});
    mocks.hasAuthenticatedSession.mockReturnValue(false);

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ status: "missing" });
  });
});

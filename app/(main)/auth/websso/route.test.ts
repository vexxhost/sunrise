import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.SUNRISE_DASHBOARD_URL = "https://sunrise.example.test";
  return {
    getSession: vi.fn(),
    startSessionLifetime: vi.fn(),
    finalizeKeystoneSession: vi.fn(),
    isStoredSessionSupersededError: vi.fn(),
  };
});

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  startSessionLifetime: mocks.startSessionLifetime,
}));
vi.mock("@/lib/keystone/login", () => ({
  finalizeKeystoneSession: mocks.finalizeKeystoneSession,
  KeystoneSessionSetupError: class KeystoneSessionSetupError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
    }
  },
}));
vi.mock("@/lib/session-errors", () => ({
  isStoredSessionSupersededError: mocks.isStoredSessionSupersededError,
}));

import { KeystoneSessionSetupError } from "@/lib/keystone/login";
import { POST } from "./route";

function request() {
  return new Request("https://sunrise.example.test/auth/websso", {
    method: "POST",
    body: new URLSearchParams({ token: "unscoped-token" }),
  });
}

describe("legacy WebSSO recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.startSessionLifetime.mockResolvedValue(undefined);
    mocks.isStoredSessionSupersededError.mockReturnValue(false);
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
    expect(mocks.startSessionLifetime).toHaveBeenCalledWith(session);
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
    const superseded = new Error("superseded");
    const session = { save: vi.fn() };
    mocks.getSession.mockResolvedValue(session);
    mocks.startSessionLifetime.mockRejectedValue(superseded);
    mocks.isStoredSessionSupersededError.mockImplementation(
      (error: unknown) => error === superseded,
    );

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(session.save).not.toHaveBeenCalled();
    expect(mocks.finalizeKeystoneSession).not.toHaveBeenCalled();
  });

  it("redirects when the final session save was superseded", async () => {
    const superseded = new Error("superseded");
    const session = { save: vi.fn().mockRejectedValue(superseded) };
    mocks.getSession.mockResolvedValue(session);
    mocks.finalizeKeystoneSession.mockResolvedValue({ status: "ready" });
    mocks.isStoredSessionSupersededError.mockImplementation(
      (error: unknown) => error === superseded,
    );

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(session.save).toHaveBeenCalledOnce();
  });
});

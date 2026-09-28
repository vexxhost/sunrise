import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.DASHBOARD_URL = "https://sunrise.example.test";
  return {
    getSession: vi.fn(),
    finalizeKeystoneSession: vi.fn(),
  };
});

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/keystone/login", () => ({
  finalizeKeystoneSession: mocks.finalizeKeystoneSession,
  KeystoneSessionSetupError: class KeystoneSessionSetupError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
    }
  },
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
});

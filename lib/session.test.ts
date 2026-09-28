import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: {},
  cookies: vi.fn(),
  getIronSession: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("iron-session", () => ({ getIronSession: mocks.getIronSession }));

import { getSession, isS3StsCredentialFresh } from "@/lib/session";

describe("Sunrise session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
    mocks.getIronSession.mockResolvedValue({});
  });

  it("uses encrypted cookie chunks for the combined cloud session", async () => {
    await getSession();

    expect(mocks.getIronSession).toHaveBeenCalledWith(mocks.cookieStore, {
      cookieName: "sunrise",
      password: "test-session-secret-at-least-32-characters",
      chunk: true,
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

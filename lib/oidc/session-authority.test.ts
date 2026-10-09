import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoredSessionSupersededError } from "@/lib/session-errors";

const mocks = vi.hoisted(() => ({
  saveRedisSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session-store", () => ({
  saveRedisSession: mocks.saveRedisSession,
}));

import {
  OidcSessionSupersededError,
  saveOidcSessionIfAuthoritative,
} from "@/lib/oidc/session-authority";

describe("OIDC session authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("translates stored-session rotation into OIDC supersession", async () => {
    mocks.saveRedisSession.mockRejectedValue(
      new StoredSessionSupersededError(
        "Cannot save a revoked Sunrise session",
      ),
    );

    await expect(
      saveOidcSessionIfAuthoritative({} as never, {}),
    ).rejects.toBeInstanceOf(OidcSessionSupersededError);
  });

  it("does not hide Redis transport failures", async () => {
    const failure = new Error("Redis unavailable");
    mocks.saveRedisSession.mockRejectedValue(failure);

    await expect(
      saveOidcSessionIfAuthoritative({} as never, {}),
    ).rejects.toBe(failure);
  });
});

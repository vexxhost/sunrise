import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class S3ProjectRoleUnavailableError extends Error {}

  return {
    ensureActiveProjectS3Credentials: vi.fn(),
    getS3Endpoint: vi.fn(),
    getSession: vi.fn(),
    S3ProjectRoleUnavailableError,
  };
});

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/s3/endpoint", () => ({
  getS3Endpoint: mocks.getS3Endpoint,
  S3_REGION: "RegionOne",
}));

vi.mock("@/lib/s3/session", () => ({
  ensureActiveProjectS3Credentials:
    mocks.ensureActiveProjectS3Credentials,
  S3ProjectRoleUnavailableError: mocks.S3ProjectRoleUnavailableError,
}));

import { getStsCredentialsForBrowser } from "@/lib/s3/browser-creds";

describe("getStsCredentialsForBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ projectId: "project-id" });
  });

  it("routes a revoked project role through credential recovery", async () => {
    mocks.ensureActiveProjectS3Credentials.mockRejectedValue(
      new mocks.S3ProjectRoleUnavailableError(),
    );

    await expect(getStsCredentialsForBrowser()).resolves.toEqual({
      ok: false,
      needsAuth: true,
    });
    expect(mocks.getS3Endpoint).not.toHaveBeenCalled();
  });
});

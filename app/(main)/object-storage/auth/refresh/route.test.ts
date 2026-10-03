import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.DASHBOARD_URL = "https://sunrise.example.test";
  return {
    clearS3Credentials: vi.fn(),
    getSession: vi.fn(),
    getS3Endpoint: vi.fn(),
    refreshActiveProjectS3Credentials: vi.fn(),
  };
});

vi.mock("@/lib/session", () => ({
  clearS3Credentials: mocks.clearS3Credentials,
  getSession: mocks.getSession,
}));

vi.mock("@/lib/s3/session", () => ({
  refreshActiveProjectS3Credentials: mocks.refreshActiveProjectS3Credentials,
}));
vi.mock("@/lib/s3/endpoint", () => ({
  getS3Endpoint: mocks.getS3Endpoint,
}));

import { GET } from "./route";

function session() {
  return {
    projectId: "project-1",
    oidcIdProvider: "demo",
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Object Storage auth refresh route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getS3Endpoint.mockResolvedValue("https://s3.example.test");
  });

  it("returns to the exact Object Storage view after silent renewal", async () => {
    mocks.getSession.mockResolvedValue(session());
    mocks.refreshActiveProjectS3Credentials.mockResolvedValue({
      accessKeyId: "access-key",
    });

    const response = await GET(
      new Request(
        "https://sunrise.example.test/object-storage/auth/refresh?returnTo=%2Fobject-storage%2Fbuckets%2Fexample%3Fprefix%3Dreports%252F",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/object-storage/buckets/example?prefix=reports%2F",
    );
  });

  it("bootstraps the RGW public client when its refresh token is unavailable", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.refreshActiveProjectS3Credentials.mockResolvedValue(undefined);

    const response = await GET(
      new Request(
        "https://sunrise.example.test/object-storage/auth/refresh?returnTo=%2Fobject-storage%2Froles",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/object-storage/auth/login?returnTo=%2Fobject-storage%2Froles",
    );
    expect(mocks.clearS3Credentials).toHaveBeenCalledWith(current);
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("shows contextual recovery instead of looping on RGW failures", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.refreshActiveProjectS3Credentials.mockRejectedValue(
      new Error("STS access denied"),
    );

    const response = await GET(
      new Request(
        "https://sunrise.example.test/object-storage/auth/refresh?returnTo=%2Fobject-storage%2Fbuckets",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/object-storage/auth/unavailable?returnTo=%2Fobject-storage%2Fbuckets",
    );
    expect(mocks.clearS3Credentials).toHaveBeenCalledWith(current);
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("returns to Object Storage when S3 is not the active backend", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.getS3Endpoint.mockRejectedValue(new Error("Swift selected"));

    const response = await GET(
      new Request(
        "https://sunrise.example.test/object-storage/auth/refresh?returnTo=%2Fobject-storage%2Fbuckets",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/object-storage",
    );
    expect(mocks.refreshActiveProjectS3Credentials).not.toHaveBeenCalled();
    expect(mocks.clearS3Credentials).toHaveBeenCalledWith(current);
  });
});

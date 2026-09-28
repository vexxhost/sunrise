import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  removeSavedResourcePreferences: vi.fn(),
  verifyResourceRecoveryProof: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/resource-preference-store", () => ({
  removeSavedResourcePreferences: mocks.removeSavedResourcePreferences,
}));
vi.mock("@/lib/resource-recovery-proof", () => ({
  verifyResourceRecoveryProof: mocks.verifyResourceRecoveryProof,
}));

import { GET } from "./route";

describe("resource recovery route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    });
    mocks.removeSavedResourcePreferences.mockResolvedValue(1);
    mocks.verifyResourceRecoveryProof.mockReturnValue(true);
  });

  it("removes a definitively missing saved resource before redirecting", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=instance&id=removed-server&recoveryAt=1000&recoveryProof=valid",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/compute/instances?notice=resource-unavailable&kind=instance",
    );
    expect(mocks.removeSavedResourcePreferences).toHaveBeenCalledWith(
      [{ kind: "instance", id: "removed-server" }],
      { projectId: "project-a", regionId: "RegionOne" },
    );
    expect(mocks.verifyResourceRecoveryProof).toHaveBeenCalledWith(
      {
        kind: "instance",
        id: "removed-server",
        parentId: undefined,
        mode: undefined,
      },
      { projectId: "project-a", regionId: "RegionOne" },
      { issuedAt: 1000, signature: "valid" },
    );
  });

  it("does not mutate preferences for an unsigned recovery URL", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=instance&id=removed-server",
      ),
    );

    expect(response.status).toBe(307);
    expect(mocks.verifyResourceRecoveryProof).not.toHaveBeenCalled();
    expect(mocks.removeSavedResourcePreferences).not.toHaveBeenCalled();
  });

  it("does not mutate preferences when the recovery proof is rejected", async () => {
    mocks.verifyResourceRecoveryProof.mockReturnValue(false);

    await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=instance&id=removed-server&recoveryAt=1000&recoveryProof=tampered",
      ),
    );

    expect(mocks.removeSavedResourcePreferences).not.toHaveBeenCalled();
  });

  it("derives the redirect internally for direct object recovery", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=object&id=folder%2Fmissing.txt&parentId=demo-bucket&mode=direct",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/object-storage/buckets/demo-bucket/direct?notice=resource-unavailable&kind=object",
    );
    expect(mocks.removeSavedResourcePreferences).not.toHaveBeenCalled();
  });

  it("still recovers when saved preference cleanup fails", async () => {
    mocks.removeSavedResourcePreferences.mockRejectedValue(
      new Error("cookie unavailable"),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=bucket&id=removed-bucket&recoveryAt=1000&recoveryProof=valid",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/object-storage/buckets?notice=resource-unavailable&kind=bucket",
    );
  });

  it("rejects unknown resource kinds", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=https%3A%2F%2Fevil.example&id=removed",
      ),
    );

    expect(response.status).toBe(400);
  });
});

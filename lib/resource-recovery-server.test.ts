import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createResourceRecoveryProof: vi.fn(),
  getSession: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/resource-recovery-proof", () => ({
  createResourceRecoveryProof: mocks.createResourceRecoveryProof,
}));

import { recoverMissingResource } from "@/lib/resource-recovery-server";

describe("missing resource recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    });
    mocks.createResourceRecoveryProof.mockReturnValue({
      issuedAt: 1_000,
      signature: "signed-proof",
    });
    mocks.redirect.mockImplementation(() => {
      throw new Error("redirected");
    });
  });

  it("binds the recovery redirect to a signed active context", async () => {
    await expect(
      recoverMissingResource({ kind: "instance", id: "server-a" }),
    ).rejects.toThrow("redirected");

    expect(mocks.createResourceRecoveryProof).toHaveBeenCalledWith(
      { kind: "instance", id: "server-a" },
      { projectId: "project-a", regionId: "RegionOne" },
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/api/preferences/resources/recover?kind=instance&id=server-a&recoveryAt=1000&recoveryProof=signed-proof",
    );
  });
});

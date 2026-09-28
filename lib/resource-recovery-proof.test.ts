import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createResourceRecoveryProof,
  verifyResourceRecoveryProof,
} from "@/lib/resource-recovery-proof";

const target = { kind: "instance" as const, id: "server-a" };
const context = { projectId: "project-a", regionId: "RegionOne" };

describe("resource recovery proof", () => {
  beforeEach(() => {
    vi.stubEnv(
      "SESSION_SECRET",
      "test-session-secret-with-at-least-32-characters",
    );
  });

  it("accepts a fresh proof for the exact resource and context", () => {
    const proof = createResourceRecoveryProof(target, context, 1_000);

    expect(proof).not.toBeNull();
    expect(
      verifyResourceRecoveryProof(target, context, proof!, 1_030),
    ).toBe(true);
  });

  it("rejects expired, tampered, and cross-project proofs", () => {
    const proof = createResourceRecoveryProof(target, context, 1_000)!;

    expect(verifyResourceRecoveryProof(target, context, proof, 1_031)).toBe(
      false,
    );
    expect(
      verifyResourceRecoveryProof(
        { ...target, id: "server-b" },
        context,
        proof,
        1_010,
      ),
    ).toBe(false);
    expect(
      verifyResourceRecoveryProof(
        target,
        { ...context, projectId: "project-b" },
        proof,
        1_010,
      ),
    ).toBe(false);
  });
});

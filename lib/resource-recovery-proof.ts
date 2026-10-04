import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ResourceRecoveryTarget } from "@/lib/resource-recovery";
import {
  normalizeResourceProjectId,
  type ResourcePreferenceContext,
} from "@/lib/resource-preferences";

const RECOVERY_PROOF_MAX_AGE_SECONDS = 30;
const RECOVERY_PROOF_CLOCK_SKEW_SECONDS = 5;

export type ResourceRecoveryProof = {
  issuedAt: number;
  signature: string;
};

function recoveryProofPayload(
  target: ResourceRecoveryTarget,
  context: ResourcePreferenceContext,
  issuedAt: number,
) {
  return JSON.stringify([
    "sunrise-resource-recovery-v1",
    normalizeResourceProjectId(context.projectId),
    context.regionId.trim(),
    target.kind,
    target.id,
    target.parentId ?? "",
    target.mode ?? "",
    issuedAt,
  ]);
}

function recoverySecret() {
  const secret = process.env.SUNRISE_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function createResourceRecoveryProof(
  target: ResourceRecoveryTarget,
  context: ResourcePreferenceContext,
  issuedAt = Math.floor(Date.now() / 1_000),
): ResourceRecoveryProof | null {
  const secret = recoverySecret();
  if (!secret || !Number.isSafeInteger(issuedAt) || issuedAt <= 0) return null;

  return {
    issuedAt,
    signature: createHmac("sha256", secret)
      .update(recoveryProofPayload(target, context, issuedAt))
      .digest("base64url"),
  };
}

export function verifyResourceRecoveryProof(
  target: ResourceRecoveryTarget,
  context: ResourcePreferenceContext,
  proof: ResourceRecoveryProof,
  now = Math.floor(Date.now() / 1_000),
) {
  const secret = recoverySecret();
  if (
    !secret ||
    !Number.isSafeInteger(proof.issuedAt) ||
    proof.issuedAt <= 0 ||
    proof.issuedAt > now + RECOVERY_PROOF_CLOCK_SKEW_SECONDS ||
    now - proof.issuedAt > RECOVERY_PROOF_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(recoveryProofPayload(target, context, proof.issuedAt))
    .digest();

  try {
    const received = Buffer.from(proof.signature, "base64url");
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  } catch {
    return false;
  }
}

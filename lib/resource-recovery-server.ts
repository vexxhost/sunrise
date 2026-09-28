import "server-only";

import { redirect } from "next/navigation";
import { isOpenStackNotFoundError } from "@/lib/openstack/request";
import {
  resourceRecoveryPath,
  type ResourceRecoveryTarget,
} from "@/lib/resource-recovery";
import { createResourceRecoveryProof } from "@/lib/resource-recovery-proof";
import { getSession } from "@/lib/session";

export async function recoverMissingResource(
  target: ResourceRecoveryTarget,
): Promise<never> {
  const path = resourceRecoveryPath(target);
  const session = await getSession();
  if (!session.projectId || !session.regionId) redirect(path);

  const proof = createResourceRecoveryProof(target, {
    projectId: session.projectId,
    regionId: session.regionId,
  });
  if (!proof) redirect(path);

  const recoveryUrl = new URL(path, "http://sunrise.local");
  recoveryUrl.searchParams.set("recoveryAt", String(proof.issuedAt));
  recoveryUrl.searchParams.set("recoveryProof", proof.signature);
  redirect(`${recoveryUrl.pathname}${recoveryUrl.search}`);
}

export async function recoverMissingOpenStackResource(
  error: unknown,
  target: ResourceRecoveryTarget,
): Promise<never> {
  if (!isOpenStackNotFoundError(error)) throw error;
  return recoverMissingResource(target);
}

export async function fetchOpenStackResourceOrRecover<T>(
  request: Promise<T>,
  target: ResourceRecoveryTarget,
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    return recoverMissingOpenStackResource(error, target);
  }
}

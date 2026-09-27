import "server-only";

import { redirect } from "next/navigation";
import { isOpenStackNotFoundError } from "@/lib/openstack/request";
import {
  resourceRecoveryPath,
  type ResourceRecoveryTarget,
} from "@/lib/resource-recovery";

export function recoverMissingResource(target: ResourceRecoveryTarget): never {
  redirect(resourceRecoveryPath(target));
}

export function recoverMissingOpenStackResource(
  error: unknown,
  target: ResourceRecoveryTarget,
): never {
  if (!isOpenStackNotFoundError(error)) throw error;
  recoverMissingResource(target);
}

export async function fetchOpenStackResourceOrRecover<T>(
  request: Promise<T>,
  target: ResourceRecoveryTarget,
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    recoverMissingOpenStackResource(error, target);
  }
}

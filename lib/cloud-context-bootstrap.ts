import "server-only";

import { randomUUID } from "node:crypto";
import type { OpenStackCatalogService } from "@/lib/openstack/catalog";
import type { Project, Region } from "@/types/openstack/keystone";

const BOOTSTRAP_TTL_MS = 30_000;
const MAX_BOOTSTRAPS = 256;

export type CloudContextBootstrap = {
  projects: Project[];
  regions: Region[];
  catalog?: OpenStackCatalogService[];
  userName?: string;
};

type BootstrapEntry = {
  contextTaken: boolean;
  expiresAt: number;
  value: CloudContextBootstrap;
};

const sunriseRuntime = globalThis as typeof globalThis & {
  sunriseCloudContextBootstraps?: Map<string, BootstrapEntry>;
};
const bootstrapStore =
  sunriseRuntime.sunriseCloudContextBootstraps ??
  new Map<string, BootstrapEntry>();
sunriseRuntime.sunriseCloudContextBootstraps = bootstrapStore;

function pruneBootstraps(now = Date.now()) {
  for (const [id, entry] of bootstrapStore) {
    if (entry.expiresAt <= now) bootstrapStore.delete(id);
  }

  while (bootstrapStore.size >= MAX_BOOTSTRAPS) {
    const oldest = bootstrapStore.keys().next().value;
    if (typeof oldest !== "string") break;
    bootstrapStore.delete(oldest);
  }
}

/**
 * Carry non-secret Keystone discovery results across the callback redirect.
 *
 * This is an opportunistic one-use optimization. A multi-replica request that
 * lands on another process simply misses the handoff and performs normal
 * discovery, so session correctness never depends on process-local state.
 */
export function stashCloudContextBootstrap(
  value: CloudContextBootstrap,
): string {
  const now = Date.now();
  pruneBootstraps(now);
  const id = randomUUID();
  bootstrapStore.set(id, {
    contextTaken: false,
    expiresAt: now + BOOTSTRAP_TTL_MS,
    value,
  });
  return id;
}

export function takeCloudContextBootstrap(
  id?: string,
): CloudContextBootstrap | undefined {
  if (!id) return undefined;

  const entry = bootstrapStore.get(id);
  if (!entry || entry.contextTaken || entry.expiresAt <= Date.now()) {
    if (entry?.expiresAt && entry.expiresAt <= Date.now()) {
      bootstrapStore.delete(id);
    }
    return undefined;
  }
  entry.contextTaken = true;
  return entry.value;
}

export function hasFreshCloudContextBootstrap(id?: string): boolean {
  if (!id) return false;
  const entry = bootstrapStore.get(id);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    bootstrapStore.delete(id);
    return false;
  }
  return true;
}

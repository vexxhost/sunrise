import type { Server } from "@/types/openstack";

export type ServerLifecycleAction =
  | "start"
  | "stop"
  | "soft-reboot"
  | "hard-reboot";

const TRANSITIONAL_STATUSES = new Set([
  "BUILD",
  "DELETING",
  "HARD_REBOOT",
  "MIGRATING",
  "PASSWORD",
  "REBOOT",
  "REBUILD",
  "RESCUE",
  "RESIZE",
  "REVERT_RESIZE",
  "VERIFY_RESIZE",
]);

function normalizedStatus(server: Pick<Server, "status">) {
  return server.status.trim().toUpperCase();
}

export function isServerTransitioning(
  server: Pick<Server, "status" | "OS-EXT-STS:task_state">,
) {
  return Boolean(server["OS-EXT-STS:task_state"]) ||
    TRANSITIONAL_STATUSES.has(normalizedStatus(server));
}

export function canRunServerLifecycleAction(
  server: Pick<Server, "status" | "locked" | "OS-EXT-STS:task_state">,
  action: ServerLifecycleAction,
) {
  if (server.locked || isServerTransitioning(server)) {
    return false;
  }

  const status = normalizedStatus(server);

  switch (action) {
    case "start":
      return status === "SHUTOFF";
    case "stop":
      return status === "ACTIVE";
    case "soft-reboot":
    case "hard-reboot":
      return status === "ACTIVE";
  }
}

export function canDeleteServer(
  server: Pick<Server, "status" | "locked" | "OS-EXT-STS:task_state">,
) {
  const status = normalizedStatus(server);
  return !server.locked && status !== "DELETED" && status !== "DELETING";
}

export function canRebuildServer(
  server: Pick<Server, "status" | "locked" | "OS-EXT-STS:task_state">,
) {
  if (server.locked || isServerTransitioning(server)) {
    return false;
  }

  return ["ACTIVE", "ERROR", "SHUTOFF"].includes(normalizedStatus(server));
}

export function mergeServerUpdates<T extends { id: string }>(
  existing: T[],
  updates: ReadonlyMap<string, T>,
) {
  let changed = false;
  const nextServers = existing.map((server) => {
    const updated = updates.get(server.id);
    if (!updated || updated === server) {
      return server;
    }

    changed = true;
    return updated;
  });

  return changed ? nextServers : existing;
}

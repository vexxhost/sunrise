import type { Server } from "@/types/openstack";

export type ServerLifecycleAction =
  "start" | "stop" | "soft-reboot" | "hard-reboot";

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
]);

function normalizedStatus(server: Pick<Server, "status">) {
  return server.status.trim().toUpperCase();
}

export function isServerTransitioning(
  server: Pick<Server, "status" | "OS-EXT-STS:task_state">,
) {
  return (
    Boolean(server["OS-EXT-STS:task_state"]) ||
    TRANSITIONAL_STATUSES.has(normalizedStatus(server))
  );
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

export function canResizeServer(
  server: Pick<Server, "status" | "locked" | "OS-EXT-STS:task_state">,
) {
  if (server.locked || isServerTransitioning(server)) {
    return false;
  }

  return ["ACTIVE", "SHUTOFF"].includes(normalizedStatus(server));
}

export function canResolveServerResize(
  server: Pick<Server, "status" | "locked" | "OS-EXT-STS:task_state">,
) {
  return (
    !server.locked &&
    !server["OS-EXT-STS:task_state"] &&
    normalizedStatus(server) === "VERIFY_RESIZE"
  );
}

export function canModifyServerAttachments(
  server: Pick<Server, "status" | "locked" | "OS-EXT-STS:task_state">,
) {
  if (server.locked || isServerTransitioning(server)) {
    return false;
  }

  return ["ACTIVE", "PAUSED", "SHUTOFF", "SUSPENDED"].includes(
    normalizedStatus(server),
  );
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

export function markServerTaskStateIfStatus<
  T extends Pick<Server, "status" | "OS-EXT-STS:task_state">,
>(server: T, expectedStatuses: ReadonlySet<string>, taskState: string) {
  if (
    server["OS-EXT-STS:task_state"] ||
    !expectedStatuses.has(normalizedStatus(server))
  ) {
    return server;
  }

  return {
    ...server,
    "OS-EXT-STS:task_state": taskState,
  };
}

export function markServersTaskStateIfStatus<
  T extends Pick<Server, "status" | "OS-EXT-STS:task_state"> & { id: string },
>(
  existing: T[],
  serverIds: ReadonlySet<string>,
  expectedStatuses: ReadonlySet<string>,
  taskState: string,
) {
  let changed = false;
  const nextServers = existing.map((server) => {
    if (!serverIds.has(server.id)) return server;
    const updated = markServerTaskStateIfStatus(
      server,
      expectedStatuses,
      taskState,
    );
    changed = changed || updated !== server;
    return updated;
  });

  return changed ? nextServers : existing;
}

export function selectServerPollingTargets<T extends Server>(
  allServers: T[],
  visibleServers: T[],
  pendingDeletionIds: ReadonlySet<string>,
) {
  const targets = new Map<string, T>();

  for (const server of visibleServers) {
    if (isServerTransitioning(server)) {
      targets.set(server.id, server);
    }
  }

  for (const server of allServers) {
    if (pendingDeletionIds.has(server.id)) {
      targets.set(server.id, server);
    }
  }

  return [...targets.values()];
}

export function markServersDeleting<T extends Server>(
  existing: T[],
  serverIds: ReadonlySet<string>,
) {
  let changed = false;
  const nextServers = existing.map((server) => {
    if (!serverIds.has(server.id) || normalizedStatus(server) === "DELETING") {
      return server;
    }

    changed = true;
    return {
      ...server,
      status: "DELETING",
      "OS-EXT-STS:task_state": "deleting",
    };
  });

  return changed ? nextServers : existing;
}

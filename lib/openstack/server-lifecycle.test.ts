import { describe, expect, it } from "vitest";

import {
  canDeleteServer,
  canRebuildServer,
  canRunServerLifecycleAction,
  isServerTransitioning,
  markServersDeleting,
  mergeServerUpdates,
} from "@/lib/openstack/server-lifecycle";
import { formatServerActivity } from "@/lib/openstack/server-state";
import type { Server } from "@/types/openstack";

function server(
  status: string,
  overrides: Partial<Server> = {},
): Pick<Server, "status" | "locked" | "OS-EXT-STS:task_state"> {
  return {
    status,
    locked: false,
    "OS-EXT-STS:task_state": undefined,
    ...overrides,
  };
}

describe("server lifecycle availability", () => {
  it("only starts stopped instances and only stops running instances", () => {
    expect(canRunServerLifecycleAction(server("SHUTOFF"), "start")).toBe(true);
    expect(canRunServerLifecycleAction(server("ACTIVE"), "start")).toBe(false);
    expect(canRunServerLifecycleAction(server("ACTIVE"), "stop")).toBe(true);
    expect(canRunServerLifecycleAction(server("SHUTOFF"), "stop")).toBe(false);
  });

  it("offers reboot only for stable running instances", () => {
    expect(canRunServerLifecycleAction(server("ACTIVE"), "soft-reboot")).toBe(
      true,
    );
    expect(canRunServerLifecycleAction(server("ACTIVE"), "hard-reboot")).toBe(
      true,
    );
    expect(
      canRunServerLifecycleAction(
        server("ACTIVE", { "OS-EXT-STS:task_state": "image_uploading" }),
        "hard-reboot",
      ),
    ).toBe(false);
  });

  it("recognizes both task states and Nova status transitions", () => {
    expect(isServerTransitioning(server("REBUILD"))).toBe(true);
    expect(
      isServerTransitioning(
        server("ACTIVE", { "OS-EXT-STS:task_state": "powering_off" }),
      ),
    ).toBe(true);
    expect(isServerTransitioning(server("ACTIVE"))).toBe(false);
  });

  it("blocks destructive and rebuild actions for locked instances", () => {
    const locked = server("ACTIVE", { locked: true });
    expect(canDeleteServer(locked)).toBe(false);
    expect(canRebuildServer(locked)).toBe(false);
  });

  it("allows rebuild only from stable recoverable states", () => {
    expect(canRebuildServer(server("ACTIVE"))).toBe(true);
    expect(canRebuildServer(server("SHUTOFF"))).toBe(true);
    expect(canRebuildServer(server("ERROR"))).toBe(true);
    expect(canRebuildServer(server("BUILD"))).toBe(false);
  });
});

describe("server polling updates", () => {
  const first = { id: "server-a", status: "ACTIVE" };
  const second = { id: "server-b", status: "ACTIVE" };

  it("preserves the list reference when poll data is unchanged", () => {
    const existing = [first, second];
    const result = mergeServerUpdates(existing, new Map([[first.id, first]]));

    expect(result).toBe(existing);
  });

  it("returns a new list only when a polled server changes", () => {
    const existing = [first, second];
    const updated = { ...first, status: "REBOOT" };
    const result = mergeServerUpdates(
      existing,
      new Map([[updated.id, updated]]),
    );

    expect(result).not.toBe(existing);
    expect(result).toEqual([updated, second]);
    expect(result[1]).toBe(second);
  });

  it("ignores updates for servers outside the current list", () => {
    const existing = [first, second];
    const result = mergeServerUpdates(
      existing,
      new Map([["server-c", { id: "server-c", status: "BUILD" }]]),
    );

    expect(result).toBe(existing);
  });

  it("marks successful delete targets for transition polling", () => {
    const firstServer = { ...first, "OS-EXT-STS:task_state": undefined };
    const secondServer = { ...second, "OS-EXT-STS:task_state": undefined };
    const result = markServersDeleting(
      [firstServer, secondServer] as Server[],
      new Set([first.id]),
    );

    expect(result[0]).toMatchObject({
      id: first.id,
      status: "DELETING",
      "OS-EXT-STS:task_state": "deleting",
    });
    expect(result[1]).toBe(secondServer);
  });
});

describe("server activity labels", () => {
  it("prefers Nova task detail while an instance is transitioning", () => {
    expect(formatServerActivity("ACTIVE", "powering_off")).toBe("Stopping");
    expect(formatServerActivity("REBUILD", undefined)).toBe("Rebuild");
  });
});

import { describe, expect, it } from "vitest";

import {
  canDeleteServer,
  canRebuildServer,
  canRunServerLifecycleAction,
  isServerTransitioning,
} from "@/lib/openstack/server-lifecycle";
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
    expect(canRunServerLifecycleAction(server("ACTIVE"), "soft-reboot")).toBe(true);
    expect(canRunServerLifecycleAction(server("ACTIVE"), "hard-reboot")).toBe(true);
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

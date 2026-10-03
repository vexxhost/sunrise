import { describe, expect, it } from "vitest";

import {
  canDeleteServer,
  canModifyServerAttachments,
  canRebuildServer,
  canResizeServer,
  canResolveServerResize,
  canRunServerLifecycleAction,
  isServerTransitioning,
  markServersTaskStateIfStatus,
  markServerTaskStateIfStatus,
  markServersDeleting,
  mergeServerUpdates,
  selectServerPollingTargets,
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

  it("offers resize only from stable active or stopped states", () => {
    expect(canResizeServer(server("ACTIVE"))).toBe(true);
    expect(canResizeServer(server("SHUTOFF"))).toBe(true);
    expect(canResizeServer(server("ERROR"))).toBe(false);
    expect(canResizeServer(server("RESIZE"))).toBe(false);
  });

  it("treats VERIFY_RESIZE as a decision state instead of a transition", () => {
    const awaitingDecision = server("VERIFY_RESIZE");
    expect(isServerTransitioning(awaitingDecision)).toBe(false);
    expect(canResolveServerResize(awaitingDecision)).toBe(true);
    expect(
      canResolveServerResize(
        server("VERIFY_RESIZE", { "OS-EXT-STS:task_state": "resize_finish" }),
      ),
    ).toBe(false);
  });

  it("allows attachment changes only while the instance is stable", () => {
    expect(canModifyServerAttachments(server("ACTIVE"))).toBe(true);
    expect(canModifyServerAttachments(server("SHUTOFF"))).toBe(true);
    expect(canModifyServerAttachments(server("BUILD"))).toBe(false);
    expect(canModifyServerAttachments(server("ACTIVE", { locked: true }))).toBe(
      false,
    );
  });

  it("keeps polling alive when Nova has not exposed a resize transition yet", () => {
    const active = server("ACTIVE");
    const expected = new Set(["ACTIVE", "SHUTOFF"]);
    const marked = markServerTaskStateIfStatus(active, expected, "resize_prep");

    expect(marked["OS-EXT-STS:task_state"]).toBe("resize_prep");
    expect(isServerTransitioning(marked)).toBe(true);
    expect(
      markServerTaskStateIfStatus(server("RESIZE"), expected, "resize_prep"),
    ).toEqual(server("RESIZE"));
  });

  it("marks only matching cached servers for continued transition polling", () => {
    const current = [
      { ...server("VERIFY_RESIZE"), id: "server-a" },
      { ...server("ACTIVE"), id: "server-b" },
    ];
    const next = markServersTaskStateIfStatus(
      current,
      new Set(["server-a"]),
      new Set(["VERIFY_RESIZE"]),
      "resize_confirming",
    );

    expect(next[0]?.["OS-EXT-STS:task_state"]).toBe("resize_confirming");
    expect(next[1]).toBe(current[1]);
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

  it("polls pending deletions even when they are outside the visible page", () => {
    const hiddenDeleting = {
      ...second,
      "OS-EXT-STS:task_state": undefined,
    } as Server;
    const visibleStable = {
      ...first,
      "OS-EXT-STS:task_state": undefined,
    } as Server;

    expect(
      selectServerPollingTargets(
        [visibleStable, hiddenDeleting],
        [visibleStable],
        new Set([hiddenDeleting.id]),
      ),
    ).toEqual([hiddenDeleting]);
  });

  it("deduplicates visible transitions that are also pending deletion", () => {
    const deleting = {
      ...first,
      status: "DELETING",
      "OS-EXT-STS:task_state": "deleting",
    } as Server;

    expect(
      selectServerPollingTargets(
        [deleting, second as Server],
        [deleting],
        new Set([deleting.id]),
      ),
    ).toEqual([deleting]);
  });
});

describe("server activity labels", () => {
  it("prefers Nova task detail while an instance is transitioning", () => {
    expect(formatServerActivity("ACTIVE", "powering_off")).toBe("Stopping");
    expect(formatServerActivity("REBUILD", undefined)).toBe("Rebuild");
  });
});

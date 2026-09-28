import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readPrefs: vi.fn(),
  writePrefs: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prefs", () => ({
  readPrefs: mocks.readPrefs,
  writePrefs: mocks.writePrefs,
}));

import { removeSavedResourcePreferences } from "@/lib/resource-preference-store";
import type { ResourcePreference } from "@/lib/resource-preferences";

function resource(
  kind: ResourcePreference["kind"],
  id: string,
  projectId = "projecta",
  regionId = "RegionOne",
): ResourcePreference {
  return { kind, id, name: id, projectId, regionId, updatedAt: 1 };
}

describe("saved resource preference cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writePrefs.mockResolvedValue(undefined);
  });

  it("removes every matching recent and pinned resource in one write", async () => {
    const retained = resource("bucket", "retained");
    mocks.readPrefs.mockResolvedValue({
      recentResources: [
        resource("instance", "server-a"),
        resource("volume", "volume-a"),
        retained,
      ],
      pinnedResources: [resource("instance", "server-a"), retained],
    });

    await expect(
      removeSavedResourcePreferences(
        [
          { kind: "instance", id: "server-a" },
          { kind: "volume", id: "volume-a" },
        ],
        { projectId: "project-a", regionId: "RegionOne" },
      ),
    ).resolves.toBe(3);

    expect(mocks.writePrefs).toHaveBeenCalledWith({
      recentResources: [retained],
      pinnedResources: [retained],
    });
  });

  it("does not remove an identical resource from another context", async () => {
    const otherProject = resource("bucket", "shared-name", "projectb");
    mocks.readPrefs.mockResolvedValue({ recentResources: [otherProject] });

    await expect(
      removeSavedResourcePreferences(
        [{ kind: "bucket", id: "shared-name" }],
        { projectId: "project-a", regionId: "RegionOne" },
      ),
    ).resolves.toBe(0);
    expect(mocks.writePrefs).not.toHaveBeenCalled();
  });
});

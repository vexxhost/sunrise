import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  readPrefs: vi.fn(),
  writePrefs: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prefs", () => ({
  readPrefs: mocks.readPrefs,
  writePrefs: mocks.writePrefs,
}));

import { GET } from "./route";

const currentProject = "7a96a68dc8264f3d84fafd95a72265c5";

function instancePreference(projectId: string, regionId = "RegionOne") {
  return {
    kind: "instance" as const,
    id: "removed-server",
    name: "Removed server",
    projectId,
    regionId,
    updatedAt: 10,
  };
}

describe("resource recovery route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      projectId: currentProject,
      regionId: "RegionOne",
    });
    mocks.readPrefs.mockResolvedValue({});
    mocks.writePrefs.mockResolvedValue(undefined);
  });

  it("removes only the stale preference in the active project and region", async () => {
    const current = instancePreference(currentProject);
    const otherProject = instancePreference("37c05c43a57d419097dce9eee2769027");
    const otherRegion = instancePreference(currentProject, "RegionTwo");
    mocks.readPrefs.mockResolvedValue({
      recentResources: [current, otherProject, otherRegion],
      pinnedResources: [current, otherProject],
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=instance&id=removed-server",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/compute/instances?notice=resource-unavailable&kind=instance",
    );
    expect(mocks.writePrefs).toHaveBeenCalledWith({
      recentResources: [otherProject, otherRegion],
      pinnedResources: [otherProject],
    });
  });

  it("derives the redirect internally for direct object recovery", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=object&id=folder%2Fmissing.txt&parentId=demo-bucket&mode=direct",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/object-storage/buckets/demo-bucket/direct?notice=resource-unavailable&kind=object",
    );
    expect(mocks.writePrefs).not.toHaveBeenCalled();
  });

  it("rejects unknown resource kinds", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=https%3A%2F%2Fevil.example&id=removed",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});

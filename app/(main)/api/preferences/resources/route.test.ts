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

import { POST } from "./route";

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

function recoveryRequest(origin?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) headers.set("Origin", origin);
  return new NextRequest("http://localhost/api/preferences/resources", {
    method: "POST",
    headers,
    body: JSON.stringify({
      operation: "remove-stale",
      resource: {
        kind: "instance",
        id: "removed-server",
        name: "removed-server",
      },
    }),
  });
}

describe("resource preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      keystoneProjectToken: "token",
      projectId: currentProject,
      regionId: "RegionOne",
    });
    mocks.readPrefs.mockResolvedValue({});
    mocks.writePrefs.mockResolvedValue(undefined);
  });

  it("removes only the stale preference in the authenticated context", async () => {
    const current = instancePreference(currentProject);
    const otherProject = instancePreference("37c05c43a57d419097dce9eee2769027");
    const otherRegion = instancePreference(currentProject, "RegionTwo");
    mocks.readPrefs.mockResolvedValue({
      recentResources: [current, otherProject, otherRegion],
      pinnedResources: [current, otherProject],
    });

    const response = await POST(recoveryRequest("http://localhost"));

    expect(response.status).toBe(204);
    expect(mocks.writePrefs).toHaveBeenCalledWith({
      recentResources: [otherProject, otherRegion],
      pinnedResources: [otherProject],
    });
  });

  it("rejects cross-origin preference mutations before reading the session", async () => {
    const response = await POST(recoveryRequest("https://evil.example"));

    expect(response.status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.writePrefs).not.toHaveBeenCalled();
  });

  it("rejects mutation requests without an Origin header", async () => {
    const response = await POST(recoveryRequest());

    expect(response.status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.writePrefs).not.toHaveBeenCalled();
  });
});

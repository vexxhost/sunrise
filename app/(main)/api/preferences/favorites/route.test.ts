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

const preferenceIdentity = {
  issuer: "https://identity.example.test/realms/demo",
  subject: "user-one",
};

function favoriteRequest(destinationId: unknown, origin?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) headers.set("Origin", origin);
  return new NextRequest("http://localhost/api/preferences/favorites", {
    method: "POST",
    headers,
    body: JSON.stringify({ destinationId }),
  });
}

describe("destination favorites route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      keystoneProjectToken: "token",
      oidcIdentity: preferenceIdentity,
    });
    mocks.readPrefs.mockResolvedValue({
      favoriteDestinations: ["compute.instances"],
    });
    mocks.writePrefs.mockResolvedValue(undefined);
  });

  it("adds a known destination to the authenticated user's favorites", async () => {
    const response = await POST(
      favoriteRequest("compute.volumes", "http://localhost"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      favoriteDestinations: ["compute.volumes", "compute.instances"],
    });
    expect(mocks.writePrefs).toHaveBeenCalledWith(
      {
        favoriteDestinations: ["compute.volumes", "compute.instances"],
      },
      preferenceIdentity,
    );
  });

  it("removes an existing destination favorite", async () => {
    const response = await POST(
      favoriteRequest("compute.instances", "http://localhost"),
    );

    expect(await response.json()).toEqual({ favoriteDestinations: [] });
  });

  it("rejects unknown destination IDs", async () => {
    const response = await POST(
      favoriteRequest("compute.unknown", "http://localhost"),
    );

    expect(response.status).toBe(400);
    expect(mocks.writePrefs).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutations before reading the session", async () => {
    const response = await POST(
      favoriteRequest("compute.instances", "https://evil.example"),
    );

    expect(response.status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.writePrefs).not.toHaveBeenCalled();
  });

  it("rejects preference writes when the session has no stable identity", async () => {
    mocks.getSession.mockResolvedValue({ keystoneProjectToken: "token" });

    const response = await POST(
      favoriteRequest("compute.instances", "http://localhost"),
    );

    expect(response.status).toBe(401);
    expect(mocks.readPrefs).not.toHaveBeenCalled();
    expect(mocks.writePrefs).not.toHaveBeenCalled();
  });
});

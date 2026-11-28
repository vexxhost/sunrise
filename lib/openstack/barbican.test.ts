import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSecret: vi.fn(),
  getContainer: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/barbican-server", () => ({
  getSecret: mocks.getSecret,
  getContainer: mocks.getContainer,
}));

import { getBarbicanReferenceNamesAction } from "@/lib/openstack/barbican";

const secretId = "12345678-1111-4111-8111-111111111111";
const missingId = "87654321-2222-4222-8222-222222222222";
const scope = ["RegionOne", "project-a"] as const;
const secret = { collection: "secrets", id: secretId } as const;
const container = { collection: "containers", id: secretId } as const;

describe("Barbican reference names", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({
      regionId: scope[0],
      projectId: scope[1],
    });
  });

  it("reads only the referenced metadata and deduplicates by collection and ID", async () => {
    mocks.getSecret.mockImplementation(async (id: string) => {
      if (id === missingId) throw new Error("Secret is not readable");
      return { id, name: " Client CA ", payload: "not returned" };
    });
    mocks.getContainer.mockResolvedValue({
      id: secretId.toUpperCase(),
      name: "Legacy server certificate",
    });
    await expect(
      getBarbicanReferenceNamesAction(...scope, [
        secret,
        { ...secret, id: secretId.toUpperCase() },
        { ...secret, id: missingId },
        container,
      ]),
    ).resolves.toEqual({
      [`secrets/${secretId}`]: "Client CA",
      [`containers/${secretId}`]: "Legacy server certificate",
    });
    expect(mocks.getSecret.mock.calls).toEqual([[secretId], [missingId]]);
    expect(mocks.getContainer).toHaveBeenCalledExactlyOnceWith(secretId);
  });

  it("skips unnamed or unrelated records", async () => {
    mocks.getSecret.mockResolvedValue({ id: secretId, name: " " });
    mocks.getContainer.mockResolvedValue({
      id: missingId,
      name: "Other container",
    });
    await expect(
      getBarbicanReferenceNamesAction(...scope, [secret, container]),
    ).resolves.toEqual({});
  });

  it("never looks up malformed references, excessive batches, or changed scopes", async () => {
    await expect(
      getBarbicanReferenceNamesAction(...scope, [
        { ...secret, id: "../payload" },
      ]),
    ).resolves.toEqual({});
    await expect(
      getBarbicanReferenceNamesAction(...scope, Array(21).fill(secret)),
    ).resolves.toEqual({});
    await expect(
      getBarbicanReferenceNamesAction("RegionTwo", scope[1], [secret]),
    ).resolves.toEqual({});
    await expect(
      getBarbicanReferenceNamesAction(scope[0], "project-b", [container]),
    ).resolves.toEqual({});
    expect(mocks.getSecret).not.toHaveBeenCalled();
    expect(mocks.getContainer).not.toHaveBeenCalled();
  });
});

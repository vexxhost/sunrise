import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ executeOpenStackMutation: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));

import { createBarbicanSecret } from "./barbican-secret-mutation";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("Barbican secret creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeOpenStackMutation.mockResolvedValue({
      ok: true,
      data: {
        secretId: "secret-a",
        secretRef: "https://example/secrets/secret-a",
      },
      message: "created",
      scope,
      status: "success",
    });
  });

  it("preserves plain-text payload bytes", async () => {
    await createBarbicanSecret(scope, {
      name: "whitespace",
      secretType: "opaque",
      payload: "  keep this whitespace  ",
      payloadEncoding: "plain",
      contentType: "text/plain",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ payload: "  keep this whitespace  " }),
      }),
    );
  });

  it("removes formatting whitespace from base64 payloads", async () => {
    await createBarbicanSecret(scope, {
      name: "encoded",
      secretType: "opaque",
      payload: "aGVs\n bG8=",
      payloadEncoding: "base64",
      contentType: "application/octet-stream",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          payload: "aGVsbG8=",
          payload_content_encoding: "base64",
        }),
      }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  getSession: vi.fn(),
  guardMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
  resolveServiceEndpoint: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceCatalog: mocks.getServiceCatalog,
  resolveServiceEndpoint: mocks.resolveServiceEndpoint,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { GET, PUT } from "./route";

const scope = { projectId: "project-a", regionId: "RegionOne" };
const secretId = "11111111-1111-4111-8111-111111111111";

function revealRequest(projectId = scope.projectId) {
  return new Request(
    `http://localhost/api/key-manager/secrets/${secretId}/payload?disposition=inline`,
    {
      headers: {
        "X-Sunrise-Project-Id": projectId,
        "X-Sunrise-Region-Id": scope.regionId,
      },
    },
  );
}

function secretMetadata(name = "test-secret") {
  return {
    secret_ref: `https://barbican.example/v1/secrets/${secretId}`,
    name,
    status: "ACTIVE",
    secret_type: "opaque",
    content_types: { default: "text/plain" },
    created: "2026-09-30T00:00:00Z",
    updated: "2026-09-30T00:00:00Z",
  };
}

function uploadRequest(overrides: Record<string, string> = {}) {
  return new Request(
    `http://localhost/api/key-manager/secrets/${secretId}/payload`,
    {
      method: "PUT",
      headers: {
        "Content-Length": "4",
        "Content-Type": "text/plain",
        Origin: "http://localhost",
        "X-Sunrise-Project-Id": scope.projectId,
        "X-Sunrise-Region-Id": scope.regionId,
        ...overrides,
      },
      body: "test",
    },
  );
}

describe("Barbican payload upload route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { projectToken: "token", scope },
    });
    mocks.getServiceCatalog.mockResolvedValue([]);
    mocks.resolveServiceEndpoint.mockReturnValue("https://barbican.example");
    mocks.getSession.mockResolvedValue({
      keystoneProjectToken: "token",
      projectId: scope.projectId,
      regionId: scope.regionId,
    });
  });

  it("rejects cross-origin writes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await PUT(
      uploadRequest({ Origin: "https://evil.example" }),
      {
        params: Promise.resolve({ id: secretId }),
      },
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guards the active project before forwarding bytes", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: false,
      result: {
        error: { code: "context-changed", message: "The project changed." },
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await PUT(uploadRequest(), {
      params: Promise.resolve({ id: secretId }),
    });
    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams raw payload bytes to the metadata-only secret", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { "x-openstack-request-id": "request-123" },
      }),
    );
    const request = uploadRequest();
    const body = request.body;
    const response = await PUT(request, {
      params: Promise.resolve({ id: secretId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      requestId: "request-123",
      secretId,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://barbican.example/v1/secrets/${secretId}`,
      expect.objectContaining({
        method: "PUT",
        body,
        duplex: "half",
        headers: expect.objectContaining({
          "Content-Type": "text/plain",
          "OpenStack-API-Version": "key-manager 1.1",
        }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/key-manager/secrets/${secretId}`,
    );
  });

  it("rejects unsupported content types", async () => {
    const response = await PUT(
      uploadRequest({ "Content-Type": "application/json" }),
      {
        params: Promise.resolve({ id: secretId }),
      },
    );
    expect(response.status).toBe(415);
  });
});

describe("Barbican payload retrieval route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      keystoneProjectToken: "token",
      projectId: scope.projectId,
      regionId: scope.regionId,
    });
    mocks.getServiceCatalog.mockResolvedValue([]);
    mocks.resolveServiceEndpoint.mockReturnValue("https://barbican.example");
  });

  it("rejects an inline reveal after the active project changes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await GET(revealRequest("another-project"), {
      params: Promise.resolve({ id: secretId }),
    });

    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an inline, non-cacheable payload for deliberate reveal", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(secretMetadata()))
      .mockResolvedValueOnce(
        new Response("protected value", {
          headers: { "Content-Length": "15", "Content-Type": "text/plain" },
        }),
      );

    const response = await GET(revealRequest(), {
      params: Promise.resolve({ id: secretId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("content-disposition")).toBe(
      `inline; filename="test-secret"; filename*=UTF-8''test-secret`,
    );
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(await response.text()).toBe("protected value");
  });

  it("encodes non-ASCII secret names without breaking payload retrieval", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(secretMetadata("API key 🔐")))
      .mockResolvedValueOnce(new Response("protected value"));

    const response = await GET(revealRequest(), {
      params: Promise.resolve({ id: secretId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      `inline; filename="API key _"; filename*=UTF-8''API%20key%20%F0%9F%94%90`,
    );
    expect(await response.text()).toBe("protected value");
  });

  it("refuses to buffer an oversized payload for inline reveal", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(secretMetadata()))
      .mockResolvedValueOnce(
        new Response("not read", {
          headers: { "Content-Length": "100001" },
        }),
      );

    const response = await GET(revealRequest(), {
      params: Promise.resolve({ id: secretId }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "This payload is too large to reveal safely. Download it instead.",
    });
  });
});

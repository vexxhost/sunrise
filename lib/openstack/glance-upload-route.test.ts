import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  guardMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
  resolveServiceEndpoint: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceCatalog: mocks.getServiceCatalog,
  resolveServiceEndpoint: mocks.resolveServiceEndpoint,
}));

import { POST } from "@/app/(main)/compute/images/[id]/upload/route";

const scope = { projectId: "project-a", regionId: "RegionOne" };

function uploadRequest(contentType = "application/octet-stream") {
  return new Request("http://localhost/compute/images/image-a/upload", {
    method: "POST",
    headers: {
      "Content-Length": "4",
      "Content-Type": contentType,
      "X-Sunrise-Project-Id": scope.projectId,
      "X-Sunrise-Region-Id": scope.regionId,
    },
    body: new Uint8Array([1, 2, 3, 4]),
  });
}

describe("Glance streaming upload route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { projectToken: "token", scope },
    });
    mocks.getServiceCatalog.mockResolvedValue([]);
    mocks.resolveServiceEndpoint.mockReturnValue("https://glance.example");
  });

  it("rejects stale context before reading or forwarding image bytes", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: false,
      result: {
        error: {
          code: "context-changed",
          message: "The active project changed.",
        },
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(uploadRequest(), {
      params: Promise.resolve({ id: "image-a" }),
    });
    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks ownership then streams the request body to Glance", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "image-a", owner: "projecta" }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: { "x-openstack-request-id": "request-123" },
        }),
      );
    const request = uploadRequest();
    const body = request.body;
    const response = await POST(request, {
      params: Promise.resolve({ id: "image-a" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      imageId: "image-a",
      requestId: "request-123",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://glance.example/v2/images/image-a/file");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body,
      duplex: "half",
      headers: expect.objectContaining({
        "Content-Type": "application/octet-stream",
      }),
    });
  });

  it("always forwards browser-recognized files as octet-stream", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "image-a", owner: "projecta" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await POST(uploadRequest("application/x-iso9660-image"), {
      params: Promise.resolve({ id: "image-a" }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({
        "Content-Type": "application/octet-stream",
      }),
    });
  });

  it("does not upload data to an image owned by another project", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "image-a", owner: "project-b" }));
    const response = await POST(uploadRequest(), {
      params: Promise.resolve({ id: "image-a" }),
    });
    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

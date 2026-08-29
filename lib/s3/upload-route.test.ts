import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guardMutationContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));

import { POST } from "@/app/(main)/object-storage/buckets/[bucket]/upload/route";

describe("server-side S3 upload scope", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("rejects a stale project before parsing a large multipart request", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: false,
      result: {
        ok: false,
        status: "error",
        error: {
          code: "context-changed",
          message:
            "The active project changed while this page was open. Review the new project and try again.",
          retryable: true,
        },
      },
    });
    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "X-Sunrise-Project-Id": "project-a" },
    });

    const response = await POST(request, {
      params: Promise.resolve({ bucket: "tadas" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      needsAuth: false,
      error: expect.stringContaining("active project changed"),
    });
    expect(mocks.guardMutationContext).toHaveBeenCalledWith(
      { projectId: "project-a" },
      { requireProjectToken: false, requireRegion: false },
    );
  });
});

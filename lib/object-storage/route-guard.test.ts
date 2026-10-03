import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getS3Endpoint: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/s3/endpoint", () => ({
  getS3Endpoint: mocks.getS3Endpoint,
}));

import { unavailableS3RouteResponse } from "@/lib/object-storage/route-guard";

describe("S3 route availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows handlers to continue when S3 is selected", async () => {
    mocks.getS3Endpoint.mockResolvedValue("https://s3.example.test");

    await expect(
      unavailableS3RouteResponse(
        new Request("https://sunrise.example.test/object-storage/buckets/a"),
      ),
    ).resolves.toBeNull();
  });

  it("redirects handlers when S3 is unavailable or not selected", async () => {
    mocks.getS3Endpoint.mockRejectedValue(new Error("Swift selected"));

    const response = await unavailableS3RouteResponse(
      new Request(
        "https://sunrise.example.test/object-storage/buckets/a/download",
        { method: "POST" },
      ),
    );

    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe(
      "https://sunrise.example.test/object-storage",
    );
  });
});

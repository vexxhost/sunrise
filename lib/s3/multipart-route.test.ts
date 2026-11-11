import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guardMutationContext: vi.fn(),
  getS3Client: vi.fn(),
  send: vi.fn(),
  unavailableS3RouteResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/object-storage/route-guard", () => ({
  unavailableS3RouteResponse: mocks.unavailableS3RouteResponse,
}));
vi.mock("@/lib/s3/client", () => ({
  getS3Client: mocks.getS3Client,
  S3AuthRequiredError: class S3AuthRequiredError extends Error {},
}));

import {
  DELETE,
  POST,
  PUT,
} from "@/app/(main)/object-storage/buckets/[bucket]/multipart/route";

const context = { params: Promise.resolve({ bucket: "test-bucket" }) };

function request(method: string, body?: unknown) {
  return new Request("http://localhost/multipart", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Sunrise-Project-Id": "project-a",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("S3 multipart proxy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({ ok: true });
    mocks.unavailableS3RouteResponse.mockResolvedValue(null);
    mocks.getS3Client.mockResolvedValue({ send: mocks.send });
  });

  it("initiates, uploads, completes, and aborts multipart uploads", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof CreateMultipartUploadCommand) {
        return { UploadId: "upload-a" };
      }
      if (command instanceof UploadPartCommand) return { ETag: '"part-a"' };
      if (command instanceof CompleteMultipartUploadCommand) {
        return { ETag: '"object-a"' };
      }
      if (command instanceof AbortMultipartUploadCommand) return {};
      throw new Error("Unexpected command");
    });

    const initiated = await POST(
      request("POST", {
        action: "initiate",
        key: "images/disk.raw",
        contentType: "application/octet-stream",
      }),
      context,
    );
    expect(await initiated.json()).toEqual({ ok: true, uploadId: "upload-a" });

    const uploaded = await PUT(
      new Request(
        "http://localhost/multipart?key=images%2Fdisk.raw&uploadId=upload-a&partNumber=1",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Sunrise-Part-Size": "4",
            "X-Sunrise-Project-Id": "project-a",
          },
          body: new Uint8Array([1, 2, 3, 4]),
          duplex: "half",
        } as RequestInit & { duplex: "half" },
      ),
      context,
    );
    expect(await uploaded.json()).toEqual({ ok: true, etag: '"part-a"' });

    const completed = await POST(
      request("POST", {
        action: "complete",
        key: "images/disk.raw",
        uploadId: "upload-a",
        parts: [{ partNumber: 1, etag: '"part-a"' }],
      }),
      context,
    );
    expect(await completed.json()).toEqual({ ok: true, etag: '"object-a"' });

    const aborted = await DELETE(
      request("DELETE", {
        key: "images/disk.raw",
        uploadId: "upload-a",
      }),
      context,
    );
    expect(await aborted.json()).toEqual({ ok: true });
  });

  it("rejects stale project context before reading the request body", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: false,
      result: {
        ok: false,
        status: "error",
        error: {
          code: "context-changed",
          message: "The active project changed.",
        },
      },
    });
    const staleRequest = new Request("http://localhost/multipart", {
      method: "POST",
      headers: { "X-Sunrise-Project-Id": "project-a" },
      body: JSON.stringify({ action: "initiate", key: "disk.raw" }),
    });
    const response = await POST(
      staleRequest,
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.getS3Client).not.toHaveBeenCalled();
    expect(staleRequest.bodyUsed).toBe(false);
  });

  it("rejects an upload part with a mismatched declared size", async () => {
    const response = await PUT(
      new Request(
        "http://localhost/multipart?key=disk.raw&uploadId=upload-a&partNumber=1",
        {
          method: "PUT",
          headers: {
            "Content-Length": "4",
            "X-Sunrise-Part-Size": "3",
            "X-Sunrise-Project-Id": "project-a",
          },
          body: new Uint8Array([1, 2, 3, 4]),
          duplex: "half",
        } as RequestInit & { duplex: "half" },
      ),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Upload part size does not match the request body",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

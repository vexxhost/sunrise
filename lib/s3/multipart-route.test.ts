import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
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
} from "@/app/(main)/object-storage/buckets/[bucket]/multipart/route";
import { PUT } from "@/app/(main)/object-storage/buckets/[bucket]/multipart/part/route";

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
      if (command instanceof ListPartsCommand) {
        if (command.input.PartNumberMarker === "1") {
          return {
            Parts: [{ PartNumber: 2, ETag: '"part-b"', Size: 3 }],
            IsTruncated: false,
          };
        }
        return {
          Parts: [{ PartNumber: 1, ETag: '"part-a"', Size: 4 }],
          IsTruncated: true,
          NextPartNumberMarker: "1",
        };
      }
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

    const listed = await POST(
      request("POST", {
        action: "list",
        key: "images/disk.raw",
        uploadId: "upload-a",
      }),
      context,
    );
    expect(await listed.json()).toEqual({
      ok: true,
      parts: [
        { partNumber: 1, etag: '"part-a"', size: 4 },
        { partNumber: 2, etag: '"part-b"', size: 3 },
      ],
    });

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

  it("checks object conflicts with bounded concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    mocks.send.mockImplementation(async (command: unknown) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      if ((command as HeadObjectCommand).input.Key === "file-11") return {};
      throw Object.assign(new Error("Not found"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
    });
    const keys = Array.from({ length: 12 }, (_, index) => `file-${index}`);
    keys.push("file-0");

    const response = await POST(
      request("POST", { action: "check", keys }),
      context,
    );

    expect(await response.json()).toEqual({
      ok: true,
      existingKeys: expect.arrayContaining(["file-0", "file-11"]),
    });
    expect(mocks.send).toHaveBeenCalledTimes(12);
    expect(maxActive).toBe(10);
  });

  it("returns a typed 404 when the multipart upload no longer exists", async () => {
    mocks.send.mockRejectedValue(
      Object.assign(new Error("The specified upload does not exist"), {
        name: "NoSuchUpload",
        $metadata: { httpStatusCode: 404 },
      }),
    );

    const response = await POST(
      request("POST", {
        action: "list",
        key: "images/disk.raw",
        uploadId: "expired-upload",
      }),
      context,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "NoSuchUpload",
    });
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
    const response = await POST(staleRequest, context);

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

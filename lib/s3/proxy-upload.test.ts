import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findProxyUploadConflicts,
  uploadProxyFiles,
} from "@/lib/s3/proxy-upload";

const fetchMock = vi.fn();

class FakeXMLHttpRequest {
  static requests: FakeXMLHttpRequest[] = [];

  readonly upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
  } = { onprogress: null };
  method = "";
  url = "";
  status = 200;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXMLHttpRequest.requests.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader() {}

  send(body: XMLHttpRequestBodyInit | Document | null) {
    const size = (body as Blob).size;
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: size,
      total: size,
    } as ProgressEvent);
    this.responseText = JSON.stringify({
      ok: true,
      etag: `\"part-${FakeXMLHttpRequest.requests.length}\"`,
    });
    this.onload?.();
  }

  abort() {
    this.onabort?.();
  }
}

const originalFetch = globalThis.fetch;
const originalXMLHttpRequest = globalThis.XMLHttpRequest;

function largeFile(size: number) {
  return {
    name: "large.raw",
    size,
    type: "application/octet-stream",
    slice: (start: number, end: number) => ({ size: end - start }) as Blob,
  } as File;
}

describe("proxy S3 multipart upload", () => {
  beforeEach(() => {
    FakeXMLHttpRequest.requests = [];
    fetchMock.mockImplementation(async (_input, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? "{}")) as {
        action?: string;
        parts?: unknown[];
      };
      if (body.action === "initiate") {
        return Response.json({ ok: true, uploadId: "upload-a" });
      }
      if (body.action === "complete") {
        return Response.json({ ok: true, etag: "object-a" });
      }
      return Response.json({ ok: true });
    });
    globalThis.fetch = fetchMock;
    globalThis.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
    vi.clearAllMocks();
  });

  it("initiates, uploads concurrent parts, and completes the object", async () => {
    const file = largeFile(24 * 1024 * 1024);
    const progress: number[] = [];

    const result = await uploadProxyFiles(
      "project-a",
      "bucket-a",
      [{ file, key: "large.raw" }],
      (update) => progress.push(update.batchPercentage),
      new AbortController().signal,
    );

    expect(result).toEqual({ uploaded: 1, errors: [], cancelled: false });
    expect(FakeXMLHttpRequest.requests).toHaveLength(3);
    expect(
      FakeXMLHttpRequest.requests.every((request) => request.method === "PUT"),
    ).toBe(true);
    expect(
      FakeXMLHttpRequest.requests.every((request) =>
        request.url.startsWith(
          "/object-storage/buckets/bucket-a/multipart/part?",
        ),
      ),
    ).toBe(true);
    const completeCall = fetchMock.mock.calls.find(([, init]) =>
      String(init?.body).includes('"action":"complete"'),
    );
    const completeBody = JSON.parse(String(completeCall?.[1]?.body)) as {
      parts: unknown[];
    };
    expect(completeBody.parts).toHaveLength(3);
    expect(progress.at(-1)).toBe(100);
  });

  it("batches conflict checks and preserves duplicates across batches", async () => {
    const keys = Array.from({ length: 1001 }, (_, index) => `file-${index}`);
    keys.push("file-0");
    fetchMock.mockImplementation(async (_input, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        action: string;
        keys: string[];
      };
      expect(body.action).toBe("check");
      expect(body.keys.length).toBeLessThanOrEqual(1000);
      return Response.json({
        ok: true,
        existingKeys: body.keys.includes("file-1000") ? ["file-1000"] : [],
      });
    });

    await expect(
      findProxyUploadConflicts("project-a", "bucket-a", keys),
    ).resolves.toEqual(expect.arrayContaining(["file-0", "file-1000"]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

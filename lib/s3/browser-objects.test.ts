import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetBucketPolicyCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

import {
  browserUploadKey,
  findBrowserUploadConflicts,
  getBrowserBucketPolicy,
  isBrowserObjectNotFound,
  listBrowserObjects,
  removeBrowserSelection,
  uploadBrowserFiles,
} from "@/lib/s3/browser-objects";
import { S3_WEB_UPLOAD_MAX_FILE_SIZE_BYTES } from "@/lib/s3/web-upload-limits";

class FakeXMLHttpRequest {
  static requests: FakeXMLHttpRequest[] = [];

  readonly upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
  } = { onprogress: null };
  readonly headers = new Map<string, string>();
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

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  getResponseHeader(name: string) {
    return name.toLowerCase() === "etag"
      ? `"part-${FakeXMLHttpRequest.requests.indexOf(this) + 1}"`
      : null;
  }

  send(body: XMLHttpRequestBodyInit | Document | null) {
    const file = body as File;
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: file.size / 2,
      total: file.size,
    } as ProgressEvent);
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: file.size,
      total: file.size,
    } as ProgressEvent);
    this.onload?.();
  }
}

const originalXMLHttpRequest = globalThis.XMLHttpRequest;

function clientWithSend(
  send: (command: unknown) => Promise<unknown>,
): S3Client {
  return { send: vi.fn(send) } as unknown as S3Client;
}

const directCheckpointScope = {
  identityScope: "user-a",
  projectId: "project-a",
  regionId: "RegionOne",
  mode: "direct" as const,
  bucket: "tadas",
};

function largeFile(size: number) {
  return {
    name: "large.raw",
    size,
    type: "application/octet-stream",
    lastModified: 123,
    slice: (start: number, end?: number) => {
      const partSize = Math.max(0, Math.min(size, end ?? size) - start);
      return {
        size: partSize,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Blob;
    },
  } as File;
}

describe("browserUploadKey", () => {
  it("joins a folder prefix and relative file path", () => {
    expect(browserUploadKey("releases/2026", "linux/sunrise.img")).toBe(
      "releases/2026/linux/sunrise.img",
    );
  });

  it("normalizes leading and repeated slashes", () => {
    expect(browserUploadKey("/releases//", "/sunrise.img")).toBe(
      "releases/sunrise.img",
    );
  });
});

describe("uploadBrowserFiles", () => {
  beforeEach(() => {
    FakeXMLHttpRequest.requests = [];
    mocks.getSignedUrl.mockResolvedValue("https://rgw.example.test/signed");
    globalThis.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
    vi.clearAllMocks();
  });

  it("uploads directly with byte-weighted progress", async () => {
    const client = clientWithSend(async () => {
      throw new Error("The direct upload must not use S3Client.send");
    });
    const progress: number[] = [];
    const first = new File([new Uint8Array(4)], "first.bin", {
      type: "application/octet-stream",
    });
    const second = new File([new Uint8Array(6)], "second.bin");

    const result = await uploadBrowserFiles(
      client,
      "tadas",
      directCheckpointScope,
      [
        { file: first, key: "first.bin" },
        { file: second, key: "second.bin" },
      ],
      (update) => progress.push(update.batchPercentage),
      new AbortController().signal,
    );

    expect(result).toEqual({ uploaded: 2, errors: [], cancelled: false });
    expect(progress).toContain(20);
    expect(progress).toContain(70);
    expect(progress.at(-1)).toBe(100);
    expect(mocks.getSignedUrl).toHaveBeenCalledTimes(2);
    expect(mocks.getSignedUrl.mock.calls[0][1]).toBeInstanceOf(
      PutObjectCommand,
    );
    expect(FakeXMLHttpRequest.requests[0]).toMatchObject({
      method: "PUT",
      url: "https://rgw.example.test/signed",
    });
    expect(FakeXMLHttpRequest.requests[0].headers.get("Content-Type")).toBe(
      "application/octet-stream",
    );
  });

  it("uses explicit resumable multipart uploads for large files", async () => {
    const client = clientWithSend(async (command) => {
      if (command instanceof CreateMultipartUploadCommand) {
        return { UploadId: "upload-a" };
      }
      if (command instanceof CompleteMultipartUploadCommand) return {};
      throw new Error("Unexpected S3 command");
    });
    const file = largeFile(100 * 1024 * 1024);
    const progress: number[] = [];

    const result = await uploadBrowserFiles(
      client,
      "tadas",
      directCheckpointScope,
      [{ file, key: "large.raw" }],
      (update) => progress.push(update.batchPercentage),
      new AbortController().signal,
    );

    expect(result).toEqual({ uploaded: 1, errors: [], cancelled: false });
    expect(mocks.getSignedUrl).toHaveBeenCalledTimes(7);
    expect(
      mocks.getSignedUrl.mock.calls.every(
        ([, command]) => command instanceof UploadPartCommand,
      ),
    ).toBe(true);
    expect(FakeXMLHttpRequest.requests).toHaveLength(7);
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(progress.at(-1)).toBe(100);
  });

  it("rejects files over 100 GB before creating a multipart upload", async () => {
    const client = clientWithSend(async () => ({}));
    const file = largeFile(S3_WEB_UPLOAD_MAX_FILE_SIZE_BYTES + 1);

    await expect(
      uploadBrowserFiles(
        client,
        "tadas",
        directCheckpointScope,
        [{ file, key: "too-large.raw" }],
        () => undefined,
        new AbortController().signal,
      ),
    ).rejects.toThrow("100 GB web UI upload limit");
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("settles cancellation while a direct request is being signed", async () => {
    let resolveSignedUrl: ((url: string) => void) | undefined;
    mocks.getSignedUrl.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveSignedUrl = resolve;
        }),
    );
    const controller = new AbortController();
    const file = new File([new Uint8Array(4)], "cancelled.bin");

    const result = uploadBrowserFiles(
      clientWithSend(async () => ({})),
      "tadas",
      directCheckpointScope,
      [{ file, key: "cancelled.bin" }],
      () => undefined,
      controller.signal,
    );
    await vi.waitFor(() => expect(resolveSignedUrl).toBeTypeOf("function"));
    controller.abort();
    resolveSignedUrl?.("https://rgw.example.test/signed");

    await expect(result).resolves.toEqual({
      uploaded: 0,
      errors: [],
      cancelled: true,
    });
    expect(FakeXMLHttpRequest.requests).toHaveLength(0);
  });
});

describe("listBrowserObjects", () => {
  it("maps folders and objects while hiding the folder marker", async () => {
    const client = clientWithSend(async (command) => {
      expect(command).toBeInstanceOf(ListObjectsV2Command);
      return {
        CommonPrefixes: [{ Prefix: "images/linux/" }],
        Contents: [
          { Key: "images/", Size: 0 },
          {
            Key: "images/readme.txt",
            Size: 12,
            ETag: "etag",
            StorageClass: "STANDARD",
            LastModified: new Date("2026-08-09T12:00:00Z"),
          },
        ],
      };
    });

    await expect(
      listBrowserObjects(client, "tadas", "images/"),
    ).resolves.toEqual({
      rows: [
        { kind: "folder", name: "linux", fullPath: "images/linux/" },
        {
          kind: "object",
          name: "readme.txt",
          fullPath: "images/readme.txt",
          size: 12,
          lastModified: "2026-08-09T12:00:00.000Z",
          storageClass: "STANDARD",
          etag: "etag",
        },
      ],
      isTruncated: false,
    });
  });
});

describe("isBrowserObjectNotFound", () => {
  it("recognizes direct RGW missing-object and missing-bucket responses", () => {
    expect(
      isBrowserObjectNotFound(
        Object.assign(new Error("Missing"), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        }),
      ),
    ).toBe(true);
    expect(
      isBrowserObjectNotFound(
        Object.assign(new Error("Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
      ),
    ).toBe(false);
  });
});

describe("findBrowserUploadConflicts", () => {
  it("reports existing keys and duplicates in the upload queue", async () => {
    const client = clientWithSend(async (command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      const key = (command as HeadObjectCommand).input.Key;
      if (key === "new.txt") {
        throw Object.assign(new Error("Not found"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        });
      }
      return {};
    });

    const conflicts = await findBrowserUploadConflicts(client, "tadas", [
      "existing.txt",
      "new.txt",
      "duplicate.txt",
      "duplicate.txt",
    ]);

    expect(conflicts).toEqual(
      expect.arrayContaining(["existing.txt", "duplicate.txt"]),
    );
    expect(conflicts).not.toContain("new.txt");
  });
});

describe("removeBrowserSelection", () => {
  it("expands a selected folder and deletes its objects and marker", async () => {
    const client = clientWithSend(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        expect(command.input.Prefix).toBe("images/");
        return {
          Contents: [
            { Key: "images/", Size: 0 },
            { Key: "images/one.txt", Size: 1 },
            { Key: "images/two.txt", Size: 2 },
          ],
        };
      }
      expect(command).toBeInstanceOf(DeleteObjectsCommand);
      expect((command as DeleteObjectsCommand).input.Delete?.Objects).toEqual([
        { Key: "images/" },
        { Key: "images/one.txt" },
        { Key: "images/two.txt" },
      ]);
      return {
        Deleted: [
          { Key: "images/" },
          { Key: "images/one.txt" },
          { Key: "images/two.txt" },
        ],
      };
    });

    await expect(
      removeBrowserSelection(client, "tadas", [
        { kind: "folder", name: "images", fullPath: "images/" },
      ]),
    ).resolves.toEqual({ deleted: 3, errors: [] });
  });
});

describe("getBrowserBucketPolicy", () => {
  it("returns the canonical bucket ARN and a formatted policy", async () => {
    const client = clientWithSend(async (command) => {
      expect(command).toBeInstanceOf(GetBucketPolicyCommand);
      return { Policy: '{"Version":"2012-10-17","Statement":[]}' };
    });

    await expect(getBrowserBucketPolicy(client, "tadas")).resolves.toEqual({
      bucketArn: "arn:aws:s3:::tadas",
      policy: '{\n  "Version": "2012-10-17",\n  "Statement": []\n}',
    });
  });
});

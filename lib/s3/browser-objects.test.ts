import {
  DeleteObjectsCommand,
  GetBucketPolicyCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

import {
  browserUploadKey,
  findBrowserUploadConflicts,
  getBrowserBucketPolicy,
  listBrowserObjects,
  removeBrowserSelection,
  uploadBrowserFiles,
} from '@/lib/s3/browser-objects';

class FakeXMLHttpRequest {
  static requests: FakeXMLHttpRequest[] = [];

  readonly upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
  } = { onprogress: null };
  readonly headers = new Map<string, string>();
  method = '';
  url = '';
  status = 200;
  responseText = '';
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
  send: (command: unknown) => Promise<unknown>
): S3Client {
  return { send: vi.fn(send) } as unknown as S3Client;
}

describe('browserUploadKey', () => {
  it('joins a folder prefix and relative file path', () => {
    expect(browserUploadKey('releases/2026', 'linux/sunrise.img')).toBe(
      'releases/2026/linux/sunrise.img'
    );
  });

  it('normalizes leading and repeated slashes', () => {
    expect(browserUploadKey('/releases//', '/sunrise.img')).toBe(
      'releases/sunrise.img'
    );
  });
});

describe('uploadBrowserFiles', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.requests = [];
    mocks.getSignedUrl.mockResolvedValue('https://rgw.example.test/signed');
    globalThis.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
    vi.clearAllMocks();
  });

  it('uploads directly with byte-weighted progress', async () => {
    const client = clientWithSend(async () => {
      throw new Error('The direct upload must not use S3Client.send');
    });
    const progress: number[] = [];
    const first = new File([new Uint8Array(4)], 'first.bin', {
      type: 'application/octet-stream',
    });
    const second = new File([new Uint8Array(6)], 'second.bin');

    const result = await uploadBrowserFiles(
      client,
      'tadas',
      [
        { file: first, key: 'first.bin' },
        { file: second, key: 'second.bin' },
      ],
      (percentage) => progress.push(percentage)
    );

    expect(result).toEqual({ uploaded: 2, errors: [] });
    expect(progress).toContain(20);
    expect(progress).toContain(70);
    expect(progress).toContain(99);
    expect(progress.at(-1)).toBe(100);
    expect(mocks.getSignedUrl).toHaveBeenCalledTimes(2);
    expect(mocks.getSignedUrl.mock.calls[0][1]).toBeInstanceOf(
      PutObjectCommand
    );
    expect(FakeXMLHttpRequest.requests[0]).toMatchObject({
      method: 'PUT',
      url: 'https://rgw.example.test/signed',
    });
    expect(FakeXMLHttpRequest.requests[0].headers.get('Content-Type')).toBe(
      'application/octet-stream'
    );
  });
});

describe('listBrowserObjects', () => {
  it('maps folders and objects while hiding the folder marker', async () => {
    const client = clientWithSend(async (command) => {
      expect(command).toBeInstanceOf(ListObjectsV2Command);
      return {
        CommonPrefixes: [{ Prefix: 'images/linux/' }],
        Contents: [
          { Key: 'images/', Size: 0 },
          {
            Key: 'images/readme.txt',
            Size: 12,
            ETag: 'etag',
            StorageClass: 'STANDARD',
            LastModified: new Date('2026-08-09T12:00:00Z'),
          },
        ],
      };
    });

    await expect(
      listBrowserObjects(client, 'tadas', 'images/')
    ).resolves.toEqual({
      rows: [
        { kind: 'folder', name: 'linux', fullPath: 'images/linux/' },
        {
          kind: 'object',
          name: 'readme.txt',
          fullPath: 'images/readme.txt',
          size: 12,
          lastModified: '2026-08-09T12:00:00.000Z',
          storageClass: 'STANDARD',
          etag: 'etag',
        },
      ],
      isTruncated: false,
    });
  });
});

describe('findBrowserUploadConflicts', () => {
  it('reports existing keys and duplicates in the upload queue', async () => {
    const client = clientWithSend(async (command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      const key = (command as HeadObjectCommand).input.Key;
      if (key === 'new.txt') {
        throw Object.assign(new Error('Not found'), {
          name: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        });
      }
      return {};
    });

    const conflicts = await findBrowserUploadConflicts(client, 'tadas', [
      'existing.txt',
      'new.txt',
      'duplicate.txt',
      'duplicate.txt',
    ]);

    expect(conflicts).toEqual(
      expect.arrayContaining(['existing.txt', 'duplicate.txt'])
    );
    expect(conflicts).not.toContain('new.txt');
  });
});

describe('removeBrowserSelection', () => {
  it('expands a selected folder and deletes its objects and marker', async () => {
    const client = clientWithSend(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        expect(command.input.Prefix).toBe('images/');
        return {
          Contents: [
            { Key: 'images/', Size: 0 },
            { Key: 'images/one.txt', Size: 1 },
            { Key: 'images/two.txt', Size: 2 },
          ],
        };
      }
      expect(command).toBeInstanceOf(DeleteObjectsCommand);
      expect((command as DeleteObjectsCommand).input.Delete?.Objects).toEqual([
        { Key: 'images/' },
        { Key: 'images/one.txt' },
        { Key: 'images/two.txt' },
      ]);
      return {
        Deleted: [
          { Key: 'images/' },
          { Key: 'images/one.txt' },
          { Key: 'images/two.txt' },
        ],
      };
    });

    await expect(
      removeBrowserSelection(client, 'tadas', [
        { kind: 'folder', name: 'images', fullPath: 'images/' },
      ])
    ).resolves.toEqual({ deleted: 3, errors: [] });
  });
});

describe('getBrowserBucketPolicy', () => {
  it('returns the canonical bucket ARN and a formatted policy', async () => {
    const client = clientWithSend(async (command) => {
      expect(command).toBeInstanceOf(GetBucketPolicyCommand);
      return { Policy: '{"Version":"2012-10-17","Statement":[]}' };
    });

    await expect(getBrowserBucketPolicy(client, 'tadas')).resolves.toEqual({
      bucketArn: 'arn:aws:s3:::tadas',
      policy: '{\n  "Version": "2012-10-17",\n  "Statement": []\n}',
    });
  });
});

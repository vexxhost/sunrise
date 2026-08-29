import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const mocks = vi.hoisted(() => ({
  ensureActiveProjectS3Credentials: vi.fn(),
  getActiveS3Credentials: vi.fn(),
  getS3Endpoint: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getActiveS3Credentials: mocks.getActiveS3Credentials,
  getSession: mocks.getSession,
}));

vi.mock('@/lib/s3/endpoint', () => ({
  getS3Endpoint: mocks.getS3Endpoint,
  S3_REGION: 'RegionOne',
}));

vi.mock('@/lib/s3/session', () => ({
  ensureActiveProjectS3Credentials:
    mocks.ensureActiveProjectS3Credentials,
}));

import { getS3Client, S3AuthRequiredError } from '@/lib/s3/client';

const credentials = {
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key',
  sessionToken: 'session-token',
  expiration: Date.now() + 3_600_000,
  projectId: 'project-id',
};

describe('getS3Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getS3Endpoint.mockResolvedValue('https://object.example.test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses existing credentials without refreshing by default', async () => {
    const session = { projectId: 'project-id' };
    mocks.getSession.mockResolvedValue(session);
    mocks.getActiveS3Credentials.mockReturnValue(credentials);

    const client = await getS3Client();

    expect(mocks.getActiveS3Credentials).toHaveBeenCalledWith(session);
    expect(mocks.ensureActiveProjectS3Credentials).not.toHaveBeenCalled();
    expect(await client.config.requestChecksumCalculation()).toBe(
      'WHEN_REQUIRED'
    );
    client.destroy();
  });

  it('signs and parses a real S3 ListBuckets HTTP exchange', async () => {
    let requestMethod: string | undefined;
    let requestUrl: string | undefined;
    let requestAuthorization: string | undefined;
    let requestSessionToken: string | undefined;

    const responseBody = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Owner>
    <ID>rgw-owner-id</ID>
    <DisplayName>sunrise-test</DisplayName>
  </Owner>
  <Buckets>
    <Bucket>
      <Name>project-artifacts</Name>
      <CreationDate>2026-08-29T10:00:00.000Z</CreationDate>
    </Bucket>
  </Buckets>
</ListAllMyBucketsResult>`;

    const server = createServer((request, response) => {
      requestMethod = request.method;
      requestUrl = request.url;
      requestAuthorization = request.headers.authorization;
      requestSessionToken = request.headers['x-amz-security-token'] as
        | string
        | undefined;

      response.writeHead(200, {
        'content-type': 'application/xml',
        'content-length': Buffer.byteLength(responseBody),
        'x-amz-request-id': 'sunrise-request-id',
      });
      response.end(responseBody);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address() as AddressInfo;
    mocks.getS3Endpoint.mockResolvedValue(
      `http://127.0.0.1:${address.port}`
    );
    mocks.getSession.mockResolvedValue({ projectId: 'project-id' });
    mocks.getActiveS3Credentials.mockReturnValue(credentials);

    const client = await getS3Client();

    try {
      const result = await client.send(new ListBucketsCommand({}));

      expect(result.Owner).toEqual({
        ID: 'rgw-owner-id',
        DisplayName: 'sunrise-test',
      });
      expect(result.Buckets).toEqual([
        {
          Name: 'project-artifacts',
          CreationDate: new Date('2026-08-29T10:00:00.000Z'),
        },
      ]);
      expect(result.$metadata.requestId).toBe('sunrise-request-id');
      expect(requestMethod).toBe('GET');
      expect(requestUrl).toBe('/?x-id=ListBuckets');
      expect(requestAuthorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=access-key\/\d{8}\/RegionOne\/s3\/aws4_request,/
      );
      expect(requestSessionToken).toBe('session-token');
    } finally {
      client.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('refreshes credentials only when explicitly allowed', async () => {
    const session = { projectId: 'project-id' };
    mocks.getSession.mockResolvedValue(session);
    mocks.ensureActiveProjectS3Credentials.mockResolvedValue(credentials);

    const client = await getS3Client({ allowCredentialRefresh: true });

    expect(mocks.ensureActiveProjectS3Credentials).toHaveBeenCalledWith(session);
    expect(mocks.getActiveS3Credentials).not.toHaveBeenCalled();
    client.destroy();
  });

  it('requires authentication when no current credentials are available', async () => {
    mocks.getSession.mockResolvedValue({ projectId: 'project-id' });
    mocks.getActiveS3Credentials.mockReturnValue(undefined);

    await expect(getS3Client()).rejects.toBeInstanceOf(S3AuthRequiredError);
    expect(mocks.ensureActiveProjectS3Credentials).not.toHaveBeenCalled();
  });
});

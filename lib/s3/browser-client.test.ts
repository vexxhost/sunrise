import { describe, expect, it, vi } from 'vitest';

import { makeBrowserS3Client } from './browser-client';

describe('makeBrowserS3Client', () => {
  it('does not enable optional request checksums for browser uploads', async () => {
    const client = makeBrowserS3Client(
      {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        sessionToken: 'session-token',
        expiration: Date.now() + 60_000,
        projectId: 'project-id',
      },
      'https://storage.example.com',
      'us-east-1'
    );

    expect(await client.config.requestChecksumCalculation()).toBe(
      'WHEN_REQUIRED'
    );
    client.destroy();
  });

  it('deduplicates refresh for credentials approaching expiration', async () => {
    const refresh = vi.fn().mockResolvedValue({
      accessKeyId: 'fresh-access-key',
      secretAccessKey: 'fresh-secret-key',
      sessionToken: 'fresh-session-token',
      expiration: Date.now() + 60 * 60_000,
      projectId: 'project-id',
    });
    const client = makeBrowserS3Client(
      {
        accessKeyId: 'old-access-key',
        secretAccessKey: 'old-secret-key',
        sessionToken: 'old-session-token',
        expiration: Date.now() + 60_000,
        projectId: 'project-id',
      },
      'https://storage.example.com',
      'us-east-1',
      refresh
    );

    const [left, right] = await Promise.all([
      client.config.credentials(),
      client.config.credentials(),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(left.accessKeyId).toBe('fresh-access-key');
    expect(right.accessKeyId).toBe('fresh-access-key');
    client.destroy();
  });
});

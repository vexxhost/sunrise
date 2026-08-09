import { describe, expect, it } from 'vitest';

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
});

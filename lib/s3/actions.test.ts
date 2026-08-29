import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getS3Client: vi.fn(),
  send: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/s3/client', () => ({
  getS3Client: mocks.getS3Client,
  S3AuthRequiredError: class S3AuthRequiredError extends Error {},
}));

import { listObjectsForRender } from '@/lib/s3/actions';

describe('S3 object listing failures', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getS3Client.mockResolvedValue({ send: mocks.send });
  });

  it('returns an expected not-found state without logging an application error', async () => {
    const error = Object.assign(new Error('UnknownError'), {
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.send.mockRejectedValue(error);

    const result = await listObjectsForRender('missing-bucket');

    expect(result).toEqual({
      ok: false,
      needsAuth: false,
      notFound: true,
      error: 'Bucket not found.',
    });
    expect(consoleError).not.toHaveBeenCalled();
  });
});

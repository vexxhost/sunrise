import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getS3Client: vi.fn(),
}));

vi.mock('@/lib/s3/client', () => ({
  getS3Client: mocks.getS3Client,
  S3AuthRequiredError: class S3AuthRequiredError extends Error {},
}));

import { GET as downloadObject } from '../../app/(main)/object-storage/buckets/[bucket]/download/route';
import { POST as downloadSelected } from '../../app/(main)/object-storage/buckets/[bucket]/download-selected/route';

describe('S3 download route errors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getS3Client.mockReset();
  });

  it('does not expose object download errors to the client', async () => {
    const error = new Error('sensitive RGW endpoint and request details');
    error.stack = 'sensitive server-side stack trace';
    mocks.getS3Client.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await downloadObject(
      new Request('http://localhost/object-storage/buckets/test/download?key=file.txt'),
      { params: Promise.resolve({ bucket: 'test' }) }
    );
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe('Unable to download object. Please try again.');
    expect(body).not.toContain('sensitive');
    expect(log).toHaveBeenCalledWith('[s3/download] FAILED:', error);
  });

  it('does not expose selected download errors to the client', async () => {
    const error = new Error('sensitive RGW endpoint and request details');
    error.stack = 'sensitive server-side stack trace';
    mocks.getS3Client.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const form = new FormData();
    form.set(
      'entries',
      JSON.stringify([{ kind: 'object', fullPath: 'file.txt' }])
    );

    const response = await downloadSelected(
      new Request(
        'http://localhost/object-storage/buckets/test/download-selected',
        { method: 'POST', body: form }
      ),
      { params: Promise.resolve({ bucket: 'test' }) }
    );
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe(
      'Unable to download selected objects. Please try again.'
    );
    expect(body).not.toContain('sensitive');
    expect(log).toHaveBeenCalledWith('[s3/download-selected] FAILED:', error);
  });
});

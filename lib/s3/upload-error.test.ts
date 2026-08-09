import { describe, expect, it } from 'vitest';

import { describeS3UploadError } from '@/lib/s3/upload-error';

describe('describeS3UploadError', () => {
  it('replaces an HTTP 499 XML parser failure with an actionable message', () => {
    const error = Object.assign(
      new Error('@aws-sdk XML parse error: unexpected content'),
      { $metadata: { httpStatusCode: 499 } }
    );

    expect(describeS3UploadError(error)).toBe(
      'The upload connection closed before RGW accepted the object (HTTP 499). Retry the upload, or use Direct browser mode for large files.'
    );
  });

  it('keeps ordinary S3 error details', () => {
    const error = Object.assign(new Error('Access denied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });

    expect(describeS3UploadError(error)).toBe(
      'AccessDenied (403): Access denied'
    );
  });
});

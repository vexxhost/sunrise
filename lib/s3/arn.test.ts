import { describe, expect, it } from 'vitest';

import { bucketArn } from '@/lib/s3/arn';

describe('bucketArn', () => {
  it('uses the S3 ARN form without region or account fields', () => {
    expect(bucketArn('sunrise-demo1')).toBe(
      'arn:aws:s3:::sunrise-demo1'
    );
  });

  it('preserves valid bucket name punctuation', () => {
    expect(bucketArn('project.artifacts-2026')).toBe(
      'arn:aws:s3:::project.artifacts-2026'
    );
  });
});

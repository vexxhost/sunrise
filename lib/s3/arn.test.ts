import { describe, expect, it } from 'vitest';

import { bucketArn, roleNameFromArn } from '@/lib/s3/arn';

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

describe('roleNameFromArn', () => {
  it('extracts a role name from a Ceph RGW account ARN', () => {
    expect(
      roleNameFromArn(
        'arn:aws:iam::RGW08738775184976726:role/service-roles/AssumeRoleSunriseReadWrite'
      )
    ).toBe('AssumeRoleSunriseReadWrite');
  });

  it('extracts a role name from an ARN without a path', () => {
    expect(roleNameFromArn('arn:aws:iam::123456789012:role/ReadOnly')).toBe(
      'ReadOnly'
    );
  });

  it('rejects malformed role ARNs', () => {
    expect(() => roleNameFromArn('arn:aws:s3:::example')).toThrow(
      'Invalid IAM role ARN'
    );
  });
});

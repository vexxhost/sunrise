import { describe, expect, it } from 'vitest';

import { directBucketPath, directObjectPath } from './direct-route';

describe('directBucketPath', () => {
  it('encodes the bucket and preserves an object prefix', () => {
    expect(directBucketPath('shared bucket', 'reports/2026/')).toBe(
      '/object-storage/buckets/shared%20bucket/direct?prefix=reports%2F2026%2F'
    );
  });

  it('omits an empty prefix', () => {
    expect(directBucketPath('shared bucket')).toBe(
      '/object-storage/buckets/shared%20bucket/direct'
    );
  });
});

describe('directObjectPath', () => {
  it('keeps folder separators while encoding bucket and object segments', () => {
    expect(directObjectPath('bucket name', 'folder one/report #1.txt')).toBe(
      '/object-storage/buckets/bucket%20name/direct/object/folder%20one/report%20%231.txt'
    );
  });

  it.each([
    'folder/./report.txt',
    'folder/../report.txt',
    '/leading-slash.txt',
    'folder//report.txt',
  ])('keeps the exact S3 key in a query parameter for %s', (key) => {
    expect(directObjectPath('bucket name', key)).toBe(
      `/object-storage/buckets/bucket%20name/direct/object?key=${encodeURIComponent(
        key
      )}`
    );
  });
});

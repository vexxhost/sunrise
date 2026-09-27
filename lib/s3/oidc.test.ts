import { describe, expect, it } from 'vitest';

import {
  normalizeObjectStorageReturnTo,
  OBJECT_STORAGE_HOME_PATH,
} from '@/lib/s3/oidc';

describe('normalizeObjectStorageReturnTo', () => {
  it('preserves nested Object Storage routes, queries, and hashes', () => {
    expect(
      normalizeObjectStorageReturnTo(
        '/object-storage/buckets?create=bucket#bucket-list',
      ),
    ).toBe('/object-storage/buckets?create=bucket#bucket-list');
    expect(normalizeObjectStorageReturnTo('/object-storage/roles')).toBe(
      '/object-storage/roles',
    );
  });

  it.each([
    undefined,
    null,
    '',
    'https://attacker.example/object-storage/buckets',
    '//attacker.example/object-storage/buckets',
    '/compute/instances',
    '/object-storage-fake',
    '/object-storage/auth/login',
    '/object-storage/auth/callback',
  ])('falls back to the Object Storage overview for %s', (value) => {
    expect(normalizeObjectStorageReturnTo(value)).toBe(
      OBJECT_STORAGE_HOME_PATH,
    );
  });
});

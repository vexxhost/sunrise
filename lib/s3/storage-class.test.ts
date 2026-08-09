import { describe, expect, it } from 'vitest';

import { normalizeStorageClass } from './storage-class';

describe('normalizeStorageClass', () => {
  it('uses STANDARD when S3 omits the storage class', () => {
    expect(normalizeStorageClass(undefined)).toBe('STANDARD');
    expect(normalizeStorageClass(null)).toBe('STANDARD');
  });

  it('preserves an explicit storage class', () => {
    expect(normalizeStorageClass('STANDARD_IA')).toBe('STANDARD_IA');
  });
});

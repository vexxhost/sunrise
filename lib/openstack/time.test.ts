import { describe, expect, it } from 'vitest';
import { normalizeOpenStackTimestamp } from './time';

describe('normalizeOpenStackTimestamp', () => {
  it('marks naive OpenStack timestamps as UTC', () => {
    expect(normalizeOpenStackTimestamp('2026-08-30T09:51:07.000000')).toBe(
      '2026-08-30T09:51:07.000000Z',
    );
  });

  it.each([
    '2026-08-30T09:51:07Z',
    '2026-08-30T09:51:07+03:00',
    '2026-08-30T09:51:07-0400',
  ])('preserves timestamps with an explicit timezone: %s', (value) => {
    expect(normalizeOpenStackTimestamp(value)).toBe(value);
  });
});

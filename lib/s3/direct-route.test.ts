import { describe, expect, it } from 'vitest';

import { directObjectPath } from './direct-route';

describe('directObjectPath', () => {
  it('keeps folder separators while encoding bucket and object segments', () => {
    expect(directObjectPath('bucket name', 'folder one/report #1.txt')).toBe(
      '/object-storage/buckets/bucket%20name/direct/object/folder%20one/report%20%231.txt'
    );
  });
});

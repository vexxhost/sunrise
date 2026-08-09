import { describe, expect, it } from 'vitest';

import { buildUploadQueueEntries } from '@/lib/s3/upload-queue';

function folderFile(contents: string, name: string, path: string) {
  const file = new File([contents], name);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

describe('buildUploadQueueEntries', () => {
  it('keeps individually selected files removable as separate entries', () => {
    const entries = buildUploadQueueEntries([
      new File(['one'], 'one.txt'),
      new File(['two'], 'two.txt'),
    ]);

    expect(entries).toMatchObject([
      { kind: 'file', name: 'one.txt', fileIndexes: [0] },
      { kind: 'file', name: 'two.txt', fileIndexes: [1] },
    ]);
  });

  it('groups files selected through a folder picker', () => {
    const entries = buildUploadQueueEntries([
      folderFile('one', 'one.txt', 'release/one.txt'),
      folderFile('two', 'two.txt', 'release/nested/two.txt'),
      new File(['standalone'], 'standalone.txt'),
    ]);

    expect(entries).toMatchObject([
      {
        kind: 'folder',
        name: 'release',
        fileCount: 2,
        totalBytes: 6,
        fileIndexes: [0, 1],
      },
      {
        kind: 'file',
        name: 'standalone.txt',
        fileCount: 1,
        fileIndexes: [2],
      },
    ]);
  });
});


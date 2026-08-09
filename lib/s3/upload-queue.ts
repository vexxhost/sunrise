export interface UploadQueueEntry {
  id: string;
  kind: 'file' | 'folder';
  name: string;
  fileCount: number;
  totalBytes: number;
  fileIndexes: number[];
}

function relativePath(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath;
}

export function buildUploadQueueEntries(files: File[]): UploadQueueEntry[] {
  const entries: UploadQueueEntry[] = [];
  const folders = new Map<string, UploadQueueEntry>();

  files.forEach((file, index) => {
    const path = relativePath(file);
    const folderName = path?.includes('/') ? path.split('/')[0] : null;

    if (!folderName) {
      entries.push({
        id: `file-${index}`,
        kind: 'file',
        name: file.name,
        fileCount: 1,
        totalBytes: file.size,
        fileIndexes: [index],
      });
      return;
    }

    const existing = folders.get(folderName);
    if (existing) {
      existing.fileCount += 1;
      existing.totalBytes += file.size;
      existing.fileIndexes.push(index);
      return;
    }

    const entry: UploadQueueEntry = {
      id: `folder-${folderName}-${index}`,
      kind: 'folder',
      name: folderName,
      fileCount: 1,
      totalBytes: file.size,
      fileIndexes: [index],
    };
    folders.set(folderName, entry);
    entries.push(entry);
  });

  return entries;
}


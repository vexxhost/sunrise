'use client';

import { useMemo } from 'react';
import { ChevronDown, FileText, Folder, Trash2 } from 'lucide-react';
import bytes from 'bytes';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { buildUploadQueueEntries } from '@/lib/s3/upload-queue';
import type { S3UploadProgress } from '@/lib/s3/upload-batch';

interface UploadQueueMenuProps {
  files: File[];
  disabled?: boolean;
  progress?: S3UploadProgress | null;
  onChange: (files: File[]) => void;
}

export function UploadQueueMenu({
  files,
  disabled = false,
  progress = null,
  onChange,
}: UploadQueueMenuProps) {
  const entries = useMemo(() => buildUploadQueueEntries(files), [files]);

  if (entries.length === 0) return null;

  const removeEntry = (fileIndexes: number[]) => {
    const removed = new Set(fileIndexes);
    onChange(files.filter((_, index) => !removed.has(index)));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-label="Review selected uploads"
        >
          {entries.length} selected
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-medium">Upload queue</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            Clear all
          </Button>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {entries.map((entry) => {
            const EntryIcon = entry.kind === 'folder' ? Folder : FileText;
            const baseDetail =
              entry.kind === 'folder'
                ? `${entry.fileCount} ${
                    entry.fileCount === 1 ? 'file' : 'files'
                  } · ${bytes(entry.totalBytes)}`
                : bytes(entry.totalBytes);
            const fileProgress = entry.fileIndexes
              .map((index) => progress?.files[index])
              .filter((item) => item !== undefined);
            const loadedBytes = fileProgress.reduce(
              (total, item) => total + item.loadedBytes,
              0
            );
            const totalBytes = fileProgress.reduce(
              (total, item) => total + item.totalBytes,
              0
            );
            const progressPercentage =
              totalBytes > 0
                ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
                : 0;
            const progressLabel = fileProgress.some(
              (item) => item.state === 'failed'
            )
              ? 'Failed'
              : fileProgress.some((item) => item.state === 'cancelled')
                ? 'Cancelled'
                : fileProgress.length > 0 &&
                    fileProgress.every((item) => item.state === 'complete')
                  ? 'Complete'
                  : fileProgress.some((item) => item.state === 'uploading')
                    ? `${progressPercentage}%`
                    : null;
            const detail = progressLabel
              ? `${baseDetail} · ${progressLabel}`
              : baseDetail;

            return (
              <div
                key={entry.id}
                className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-2 hover:bg-accent"
              >
                <EntryIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" title={entry.name}>
                    {entry.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{detail}</div>
                  {fileProgress.length > 0 ? (
                    <div
                      className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${entry.name} upload progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progressPercentage}
                    >
                      <div
                        className="h-full bg-primary transition-[width]"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title={`Remove ${entry.name}`}
                  aria-label={`Remove ${entry.name} from upload queue`}
                  disabled={disabled}
                  onClick={() => removeEntry(entry.fileIndexes)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}


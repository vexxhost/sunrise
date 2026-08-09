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

interface UploadQueueMenuProps {
  files: File[];
  disabled?: boolean;
  onChange: (files: File[]) => void;
}

export function UploadQueueMenu({
  files,
  disabled = false,
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
          disabled={disabled}
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
            onClick={() => onChange([])}
          >
            Clear all
          </Button>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {entries.map((entry) => {
            const EntryIcon = entry.kind === 'folder' ? Folder : FileText;
            const detail =
              entry.kind === 'folder'
                ? `${entry.fileCount} ${
                    entry.fileCount === 1 ? 'file' : 'files'
                  } · ${bytes(entry.totalBytes)}`
                : bytes(entry.totalBytes);

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
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title={`Remove ${entry.name}`}
                  aria-label={`Remove ${entry.name} from upload queue`}
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


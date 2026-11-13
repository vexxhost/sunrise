"use client";

import { useRef } from "react";
import bytes from "bytes";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { S3MultipartCheckpoint } from "@/lib/s3/multipart-checkpoints";

interface ResumableUploadNoticeProps {
  checkpoints: S3MultipartCheckpoint[];
  busy?: boolean;
  onResume: (checkpoint: S3MultipartCheckpoint, file: File) => void;
  onDiscard: (checkpoint: S3MultipartCheckpoint) => void;
}

function uploadedBytes(checkpoint: S3MultipartCheckpoint) {
  return checkpoint.completedParts.reduce(
    (total, part) => total + part.size,
    0,
  );
}

export function ResumableUploadNotice({
  checkpoints,
  busy = false,
  onResume,
  onDiscard,
}: ResumableUploadNoticeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedCheckpointRef = useRef<S3MultipartCheckpoint | null>(null);

  if (checkpoints.length === 0) return null;

  return (
    <div className="border-y border-status-warning-border bg-status-warning-soft px-3 py-2 text-sm">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          const checkpoint = selectedCheckpointRef.current;
          selectedCheckpointRef.current = null;
          if (file && checkpoint) onResume(checkpoint, file);
        }}
      />
      <div className="font-medium">Interrupted uploads</div>
      <div className="mt-0.5 text-muted-foreground">
        Reselect the original file to continue its missing parts. Sunrise does
        not retain local file contents.
      </div>
      <div className="mt-2 divide-y divide-status-warning-border">
        {checkpoints.map((checkpoint) => {
          const uploaded = uploadedBytes(checkpoint);
          return (
            <div
              key={checkpoint.id}
              className="flex min-w-0 flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0"
            >
              <div className="min-w-48 flex-1">
                <div
                  className="truncate font-mono text-xs"
                  title={checkpoint.key}
                >
                  {checkpoint.key}
                </div>
                <div className="text-xs text-muted-foreground">
                  {bytes(uploaded, { unitSeparator: " " })} of{" "}
                  {bytes(checkpoint.fileSize, { unitSeparator: " " })} uploaded
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  selectedCheckpointRef.current = checkpoint;
                  inputRef.current?.click();
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Resume
              </Button>
              <Button
                type="button"
                variant="ghost"
                tone="danger"
                size="sm"
                disabled={busy}
                onClick={() => onDiscard(checkpoint)}
              >
                <Trash2 className="h-4 w-4" />
                Discard
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import bytes from "bytes";
import { Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { S3UploadProgress } from "@/lib/s3/upload-batch";

interface UploadSpeedIndicatorProps {
  progress: S3UploadProgress | null;
}

export function UploadSpeedIndicator({ progress }: UploadSpeedIndicatorProps) {
  if (!progress) return null;

  const speed =
    progress.bytesPerSecond > 0
      ? `${bytes(progress.bytesPerSecond, {
          decimalPlaces: 1,
          unitSeparator: " ",
        })}/s`
      : "Calculating";

  return (
    <Badge
      variant="secondary"
      className="min-w-28 gap-1.5 tabular-nums"
      title="Current upload speed"
      aria-label={`Current upload speed: ${speed}`}
    >
      <Gauge aria-hidden="true" />
      {speed}
    </Badge>
  );
}

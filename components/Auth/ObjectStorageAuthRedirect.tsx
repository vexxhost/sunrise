"use client";

import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { startObjectStorageCredentialRefresh } from "@/lib/s3/auth-navigation";

export function ObjectStorageAuthRedirect() {
  useEffect(() => {
    startObjectStorageCredentialRefresh();
  }, []);

  return (
    <div
      aria-live="polite"
      className="flex min-h-[45vh] items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <Spinner className="size-5" />
      Refreshing Object Storage access...
    </div>
  );
}

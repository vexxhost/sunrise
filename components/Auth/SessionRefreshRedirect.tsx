"use client";

import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { normalizeAuthReturnTo } from "@/lib/auth-return";

export function SessionRefreshRedirect() {
  useEffect(() => {
    const returnTo = normalizeAuthReturnTo(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    window.location.replace(
      `/auth/refresh?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, []);

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin text-status-info" aria-hidden />
      <span>Refreshing your cloud session...</span>
    </div>
  );
}

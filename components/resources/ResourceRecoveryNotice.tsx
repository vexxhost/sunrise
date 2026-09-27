"use client";

import { Info, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  isRecoveryResourceKind,
  recoveryPreferenceKind,
  recoveryResourceDescription,
  recoveryResourceLabel,
} from "@/lib/resource-recovery";

export function ResourceRecoveryNotice() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const kindValue = searchParams.get("kind");

  if (
    searchParams.get("notice") !== "resource-unavailable" ||
    !isRecoveryResourceKind(kindValue)
  ) {
    return null;
  }

  const preferenceKind = recoveryPreferenceKind(kindValue);
  const resourceId = searchParams.get("resourceId");
  const dismiss = () => {
    if (preferenceKind && resourceId) {
      void fetch("/api/preferences/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "remove-stale",
          resource: {
            kind: preferenceKind,
            id: resourceId,
            name: resourceId,
          },
        }),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete("notice");
    next.delete("kind");
    next.delete("resourceId");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const label = recoveryResourceLabel(kindValue);

  return (
    <div className="border-b bg-muted/30 px-4 py-2 sm:px-6">
      <div
        className="mx-auto flex max-w-screen-2xl items-start gap-2"
        role="status"
        aria-live="polite"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">
            {label[0].toUpperCase() + label.slice(1)} unavailable
          </div>
          <p className="mt-0.5 text-muted-foreground">
            {recoveryResourceDescription(kindValue)}
          </p>
        </div>
        <Button
          aria-label={
            preferenceKind && resourceId
              ? "Dismiss notice and remove stale saved resource"
              : "Dismiss notice"
          }
          className="-mr-1 -mt-1 text-muted-foreground"
          onClick={dismiss}
          size="icon-sm"
          title="Dismiss"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

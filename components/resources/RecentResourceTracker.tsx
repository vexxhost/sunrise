"use client";

import { useEffect } from "react";
import type { ResourcePreferenceInput } from "@/lib/resource-preferences";

export function RecentResourceTracker(resource: ResourcePreferenceInput) {
  const { kind, id, name } = resource;

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/preferences/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "recent",
        resource: { kind, id, name },
      }),
      credentials: "same-origin",
      signal: controller.signal,
    }).catch(() => undefined);

    return () => controller.abort();
  }, [id, kind, name]);

  return null;
}

"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { createActionIntentClearedHref } from "@/lib/create-actions";

export function useClearCreateActionIntent() {
  const router = useRouter();

  return useCallback(() => {
    const href = createActionIntentClearedHref(window.location.href);
    if (href) router.replace(href, { scroll: false });
  }, [router]);
}

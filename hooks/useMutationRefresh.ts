"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export function useMutationRefresh(queryKey?: QueryKey) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useCallback(async () => {
    if (queryKey) {
      await queryClient.invalidateQueries({ queryKey });
    } else {
      await queryClient.invalidateQueries();
    }
    router.refresh();
  }, [queryClient, queryKey, router]);
}

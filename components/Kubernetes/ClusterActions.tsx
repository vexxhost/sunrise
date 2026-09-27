"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ClusterMutationSheet } from "@/components/Kubernetes/ClusterMutationSheet";
import { Button } from "@/components/ui/button";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";

interface ClusterActionsProps {
  initiallyOpen?: boolean;
  projectId?: string;
  regionId?: string;
}

export function ClusterActions({
  initiallyOpen = false,
  projectId,
  regionId,
}: ClusterActionsProps) {
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) clearCreateActionIntent();
  };

  return (
    <>
      <Button
        disabled={!projectId || !regionId}
        onClick={() => handleOpenChange(true)}
      >
        <Plus className="size-4" />
        Create cluster
      </Button>
      {open ? (
        <ClusterMutationSheet
          open
          projectId={projectId}
          regionId={regionId}
          onOpenChange={handleOpenChange}
        />
      ) : null}
    </>
  );
}

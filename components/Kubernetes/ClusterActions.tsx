"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ClusterMutationSheet } from "@/components/Kubernetes/ClusterMutationSheet";
import { Button } from "@/components/ui/button";

interface ClusterActionsProps {
  projectId?: string;
  regionId?: string;
}

export function ClusterActions({ projectId, regionId }: ClusterActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button disabled={!projectId || !regionId} onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create cluster
      </Button>
      {open ? (
        <ClusterMutationSheet
          open
          projectId={projectId}
          regionId={regionId}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

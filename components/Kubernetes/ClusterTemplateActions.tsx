"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { ClusterTemplateMutationSheet } from "@/components/Kubernetes/ClusterTemplateMutationSheet";
import { Button } from "@/components/ui/button";
import { clearCreateActionIntent } from "@/lib/create-actions";

interface ClusterTemplateActionsProps {
  initiallyOpen?: boolean;
  projectId?: string;
  regionId?: string;
}

export function ClusterTemplateActions({
  initiallyOpen = false,
  projectId,
  regionId,
}: ClusterTemplateActionsProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) clearCreateActionIntent();
  };

  return (
    <>
      <Button onClick={() => handleOpenChange(true)}>
        <Plus className="size-4" />
        Create template
      </Button>
      {open ? (
        <ClusterTemplateMutationSheet
          open
          projectId={projectId}
          regionId={regionId}
          onOpenChange={handleOpenChange}
        />
      ) : null}
    </>
  );
}

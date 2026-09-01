"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { ClusterTemplateMutationSheet } from "@/components/Kubernetes/ClusterTemplateMutationSheet";
import { Button } from "@/components/ui/button";

interface ClusterTemplateActionsProps {
  projectId?: string;
  regionId?: string;
}

export function ClusterTemplateActions({
  projectId,
  regionId,
}: ClusterTemplateActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create template
      </Button>
      {open ? (
        <ClusterTemplateMutationSheet
          open
          projectId={projectId}
          regionId={regionId}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

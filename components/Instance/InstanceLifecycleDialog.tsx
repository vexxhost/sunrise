"use client";

import { useState, useTransition } from "react";

import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import {
  deleteServerAction,
  runServerLifecycleAction,
} from "@/lib/openstack/nova-actions";
import type { ServerLifecycleAction } from "@/lib/openstack/server-lifecycle";
import type { Server } from "@/types/openstack";

export type InstanceMutationKind = ServerLifecycleAction | "delete";

const ACTION_COPY: Record<
  InstanceMutationKind,
  {
    title: string;
    description: string;
    confirmLabel: string;
    pendingLabel: string;
    destructive?: boolean;
  }
> = {
  start: {
    title: "Start instances?",
    description: "Nova will power on the selected stopped instances.",
    confirmLabel: "Start",
    pendingLabel: "Starting",
  },
  stop: {
    title: "Stop instances?",
    description:
      "Nova will request a clean shutdown. Work stored only in memory will be lost.",
    confirmLabel: "Stop",
    pendingLabel: "Stopping",
  },
  "soft-reboot": {
    title: "Reboot instances?",
    description:
      "A graceful reboot asks each guest operating system to restart cleanly.",
    confirmLabel: "Reboot",
    pendingLabel: "Rebooting",
  },
  "hard-reboot": {
    title: "Force reboot instances?",
    description:
      "A forced reboot is equivalent to cycling power and can cause data loss.",
    confirmLabel: "Force reboot",
    pendingLabel: "Rebooting",
    destructive: true,
  },
  delete: {
    title: "Delete instances?",
    description:
      "This permanently removes the selected instances. Attached volumes are governed by their delete-on-termination setting.",
    confirmLabel: "Delete instances",
    pendingLabel: "Deleting",
    destructive: true,
  },
};

interface InstanceLifecycleDialogProps {
  action: InstanceMutationKind | null;
  instances: Server[];
  onComplete: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  regionId?: string;
}

export function InstanceLifecycleDialog({
  action,
  instances,
  onComplete,
  onOpenChange,
  projectId,
  regionId,
}: InstanceLifecycleDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!action) return null;
  const copy = ACTION_COPY[action];

  const handleConfirm = () => {
    if (!projectId || !regionId) {
      setError("Select a project and region before changing instances.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const failures: string[] = [];

      for (const instance of instances) {
        const result =
          action === "delete"
            ? await deleteServerAction({ projectId, regionId }, instance.id)
            : await runServerLifecycleAction(
                { projectId, regionId },
                instance.id,
                action,
              );

        if (!result.ok) {
          failures.push(`${instance.name || instance.id}: ${result.error.message}`);
        }
      }

      await onComplete();
      if (failures.length) {
        setError(
          failures.length === instances.length
            ? failures[0]
            : `${instances.length - failures.length} completed. ${failures.join(" ")}`,
        );
        return;
      }

      onOpenChange(false);
    });
  };

  return (
    <MutationConfirmationDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onOpenChange(false);
        }
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      pendingLabel={copy.pendingLabel}
      pending={isPending}
      error={error}
      variant={copy.destructive ? "destructive" : "default"}
      onConfirm={handleConfirm}
    >
      <div className="max-h-36 overflow-y-auto rounded-md border px-3 py-2 text-sm">
        {instances.map((instance) => (
          <div key={instance.id} className="truncate py-1">
            {instance.name || instance.id}
          </div>
        ))}
      </div>
    </MutationConfirmationDialog>
  );
}

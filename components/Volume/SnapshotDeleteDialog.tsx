"use client";

import { useState, useTransition } from "react";

import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { deleteSnapshotAction } from "@/lib/openstack/cinder-actions";
import type { Snapshot } from "@/types/openstack";

interface SnapshotDeleteDialogProps {
  onComplete: () => Promise<void> | void;
  onDeleteSuccess?: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  regionId?: string;
  snapshots: Snapshot[];
}

export function SnapshotDeleteDialog({
  onComplete,
  onDeleteSuccess,
  onOpenChange,
  projectId,
  regionId,
  snapshots,
}: SnapshotDeleteDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!projectId || !regionId) {
      setError("Select a project and region before deleting snapshots.");
      return;
    }

    startTransition(async () => {
      const results = await Promise.all(
        snapshots.map((snapshot) =>
          deleteSnapshotAction({ projectId, regionId }, snapshot.id),
        ),
      );
      const failures = results.flatMap((result) =>
        result.ok ? [] : [result.error.message],
      );
      if (failures.length) {
        void onComplete();
        setError(failures[0]);
        return;
      }
      onOpenChange(false);
      void onComplete();
      void onDeleteSuccess?.();
    });
  };

  return (
    <MutationConfirmationDialog
      open
      onOpenChange={(open) => !open && onOpenChange(false)}
      title="Delete snapshots?"
      description="This permanently removes the selected point-in-time copies. Volumes already created from them are not affected."
      confirmLabel="Delete snapshots"
      pendingLabel="Deleting"
      pending={isPending}
      error={error}
      variant="destructive"
      onConfirm={handleConfirm}
    >
      <div className="max-h-36 overflow-y-auto rounded-md border px-3 py-2 text-sm">
        {snapshots.map((snapshot) => (
          <div key={snapshot.id} className="truncate py-1">
            {snapshot.name || snapshot.id}
          </div>
        ))}
      </div>
    </MutationConfirmationDialog>
  );
}

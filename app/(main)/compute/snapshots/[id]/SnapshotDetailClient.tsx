"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { SnapshotDeleteDialog } from "@/components/Volume/SnapshotDeleteDialog";
import { Badge } from "@/components/ui/badge";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Button } from "@/components/ui/button";
import { snapshotQueryOptions } from "@/hooks/queries/useVolumes";
import {
  canDeleteSnapshot,
  isSnapshotTransitioning,
} from "@/lib/openstack/storage-lifecycle";
import { formatSnapshotStatus } from "@/lib/openstack/storage-status";

interface SnapshotDetailClientProps {
  projectId?: string;
  regionId?: string;
  snapshotId: string;
}

export function SnapshotDetailClient({
  projectId,
  regionId,
  snapshotId,
}: SnapshotDetailClientProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useMemo(
    () => snapshotQueryOptions(regionId, projectId, snapshotId),
    [projectId, regionId, snapshotId],
  );
  const { data: snapshot } = useSuspenseQuery({
    ...query,
    refetchInterval: ({ state }) =>
      state.data && isSnapshotTransitioning(state.data) ? 5_000 : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const metadata = useMemo(
    () => Object.entries(snapshot.metadata ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    [snapshot.metadata],
  );
  const refreshAfterDelete = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "snapshots"],
    });
  }, [projectId, queryClient, regionId]);
  const navigateAfterDelete = useCallback(() => {
    router.replace("/compute/snapshots");
  }, [router]);

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {snapshot.name || "Unnamed snapshot"}
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {snapshot.id}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10 gap-2 text-destructive hover:text-destructive"
          disabled={!canDeleteSnapshot(snapshot)}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Snapshot">
          <DetailField label="Name">{snapshot.name || "-"}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">{snapshot.id}</DetailField>
          <DetailField label="Description">{snapshot.description || "-"}</DetailField>
          <DetailField label="Status">
            {isSnapshotTransitioning(snapshot) ? (
              <ProgressStatusBadge label={formatSnapshotStatus(snapshot.status)} />
            ) : (
              <Badge variant={snapshot.status === "error" ? "destructive" : "secondary"}>
                {formatSnapshotStatus(snapshot.status)}
              </Badge>
            )}
          </DetailField>
          <DetailField label="Progress">
            {snapshot["os-extended-snapshot-attributes:progress"] || "-"}
          </DetailField>
          <DetailField label="Size">{snapshot.size} GB</DetailField>
          <DetailField label="Volume">
            <Link
              href={`/compute/volumes/${snapshot.volume_id}`}
              className="font-mono text-xs underline decoration-dotted underline-offset-2"
            >
              {snapshot.volume_id}
            </Link>
          </DetailField>
          <DetailField label="Created">{snapshot.created_at}</DetailField>
          <DetailField label="Updated">{snapshot.updated_at || "-"}</DetailField>
        </DetailSection>
        <DetailSection title="Metadata">
          {metadata.length ? metadata.map(([key, value]) => (
            <DetailField key={key} label={key} className="font-mono text-xs">
              {typeof value === "string" ? value : JSON.stringify(value)}
            </DetailField>
          )) : <DetailField label="Metadata">-</DetailField>}
        </DetailSection>
      </div>

      {deleteOpen ? (
        <SnapshotDeleteDialog
          snapshots={[snapshot]}
          projectId={projectId}
          regionId={regionId}
          onComplete={refreshAfterDelete}
          onDeleteSuccess={navigateAfterDelete}
          onOpenChange={() => setDeleteOpen(false)}
        />
      ) : null}
    </div>
  );
}

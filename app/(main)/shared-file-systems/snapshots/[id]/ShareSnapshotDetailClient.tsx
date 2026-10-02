"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  ShareSnapshotMutationDialog,
  type ShareSnapshotMutationKind,
} from "@/components/SharedFileSystem/ShareSnapshotMutationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shareSnapshotQueryOptions } from "@/hooks/queries/useManila";
import {
  canDeleteShareSnapshot,
  canEditShareSnapshot,
  formatManilaStatus,
  isShareSnapshotTransitioning,
  shareStatusVariant,
} from "@/lib/openstack/manila-lifecycle";
import { formatUtcTimestamp } from "@/lib/openstack/time";

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

export function ShareSnapshotDetailClient({
  snapshotId,
  projectId,
  regionId,
}: {
  snapshotId: string;
  projectId?: string;
  regionId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const snapshotQuery = useMemo(
    () => shareSnapshotQueryOptions(regionId, projectId, snapshotId),
    [projectId, regionId, snapshotId],
  );
  const { data: snapshot } = useSuspenseQuery({
    ...snapshotQuery,
    refetchInterval: ({ state }) =>
      state.data && isShareSnapshotTransitioning(state.data) ? 5_000 : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<ShareSnapshotMutationKind | null>(null);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const refreshSnapshot = useCallback(
    async (deleted = false) => {
      if (!deleted) {
        await queryClient.invalidateQueries({
          queryKey: snapshotQuery.queryKey,
        });
      }
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "share-snapshots"],
      });
      if (deleted) router.replace("/shared-file-systems/snapshots");
    },
    [projectId, queryClient, regionId, router, snapshotQuery.queryKey],
  );

  return (
    <div className="max-w-screen-xl space-y-4">
      <RecentResourceTracker
        kind="share-snapshot"
        id={snapshot.id}
        name={snapshot.name || "Unnamed snapshot"}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold">
            {snapshot.name || "Unnamed snapshot"}
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {snapshot.id}
          </p>
        </div>
        <div className="flex gap-2">
          <EditActionButton
            label="Edit share snapshot"
            disabled={!scope || !canEditShareSnapshot(snapshot)}
            onClick={() => setAction("edit")}
          />
          <Button
            size="icon"
            variant="outline"
            className="text-destructive hover:text-destructive"
            title="Delete share snapshot"
            disabled={!scope || !canDeleteShareSnapshot(snapshot)}
            onClick={() => setAction("delete")}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete share snapshot</span>
          </Button>
        </div>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Share Snapshot">
          <DetailField label="Name">{emptyToDash(snapshot.name)}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {snapshot.id}
          </DetailField>
          <DetailField label="Description">
            {emptyToDash(snapshot.description)}
          </DetailField>
          <DetailField label="Status">
            {isShareSnapshotTransitioning(snapshot) ? (
              <ProgressStatusBadge
                label={formatManilaStatus(snapshot.status)}
              />
            ) : (
              <Badge variant={shareStatusVariant(snapshot.status)}>
                {formatManilaStatus(snapshot.status)}
              </Badge>
            )}
          </DetailField>
          <DetailField label="Progress">
            {emptyToDash(snapshot.progress)}
          </DetailField>
          <DetailField label="Size">{snapshot.size} GiB</DetailField>
          <DetailField label="Protocol">
            {emptyToDash(snapshot.share_proto)}
          </DetailField>
          <DetailField label="Created">
            {formatUtcTimestamp(snapshot.created_at)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(snapshot.updated_at)}
          </DetailField>
        </DetailSection>

        <DetailSection title="Source Share">
          <DetailField label="Share">
            <ResourceLink
              href={`/shared-file-systems/shares/${encodeURIComponent(snapshot.share_id)}`}
            >
              {snapshot.share_name || snapshot.share_id}
            </ResourceLink>
          </DetailField>
          <DetailField label="Share ID" className="font-mono text-xs">
            {snapshot.share_id}
          </DetailField>
          <DetailField label="Source size">
            {snapshot.share_size ?? snapshot.size} GiB
          </DetailField>
        </DetailSection>
      </div>

      {action && scope ? (
        <ShareSnapshotMutationDialog
          key={`${action}-${snapshot.id}`}
          action={action}
          onComplete={refreshSnapshot}
          onOpenChange={() => setAction(null)}
          scope={scope}
          snapshot={snapshot}
        />
      ) : null}
    </div>
  );
}

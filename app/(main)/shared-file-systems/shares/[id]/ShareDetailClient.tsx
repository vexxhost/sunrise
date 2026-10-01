"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Pencil, Plus, Scaling, ShieldMinus, Trash2 } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  GrantShareAccessDialog,
  RevokeShareAccessDialog,
} from "@/components/SharedFileSystem/ShareAccessDialogs";
import {
  ShareMutationDialog,
  type ShareMutationKind,
} from "@/components/SharedFileSystem/ShareMutationDialog";
import { ShareSnapshotActions } from "@/components/SharedFileSystem/ShareSnapshotActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  shareAccessRulesQueryOptions,
  shareExportLocationsQueryOptions,
  shareQueryOptions,
  shareSnapshotsQueryOptions,
} from "@/hooks/queries/useManila";
import {
  canDeleteShare,
  canEditShare,
  canManageShareAccess,
  canResizeShare,
  formatManilaStatus,
  isShareTransitioning,
  shareStatusVariant,
} from "@/lib/openstack/manila-lifecycle";
import { formatUtcTimestamp } from "@/lib/openstack/time";
import type { ManilaShareAccessRule } from "@/types/openstack";

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

export function ShareDetailClient({
  projectId,
  regionId,
  shareId,
}: {
  projectId?: string;
  regionId?: string;
  shareId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const shareQuery = useMemo(
    () => shareQueryOptions(regionId, projectId, shareId),
    [projectId, regionId, shareId],
  );
  const { data: share } = useSuspenseQuery({
    ...shareQuery,
    refetchInterval: ({ state }) =>
      state.data && isShareTransitioning(state.data) ? 5_000 : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const exportsQuery = useQuery(
    shareExportLocationsQueryOptions(regionId, projectId, shareId),
  );
  const accessQuery = useQuery({
    ...shareAccessRulesQueryOptions(regionId, projectId, shareId),
    refetchInterval: ({ state }) =>
      state.data?.some(({ state: ruleState }) =>
        ["new", "applying", "denying"].includes(ruleState.toLowerCase()),
      )
        ? 5_000
        : false,
  });
  const snapshotsQuery = useQuery({
    ...shareSnapshotsQueryOptions(regionId, projectId),
    select: (snapshots) =>
      snapshots.filter((snapshot) => snapshot.share_id === shareId),
  });
  const [action, setAction] = useState<ShareMutationKind | null>(null);
  const [granting, setGranting] = useState(false);
  const [revokeRule, setRevokeRule] = useState<ManilaShareAccessRule | null>(
    null,
  );
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const metadata = useMemo(
    () =>
      Object.entries(share.metadata ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [share.metadata],
  );
  const refreshShare = useCallback(
    async (deleted = false) => {
      if (!deleted) {
        await queryClient.invalidateQueries({ queryKey: shareQuery.queryKey });
      }
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "shares"],
      });
      if (deleted) router.replace("/shared-file-systems/shares");
    },
    [projectId, queryClient, regionId, router, shareQuery.queryKey],
  );
  const refreshAccess = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "manila", "share", shareId, "access"],
    });
  }, [projectId, queryClient, regionId, shareId]);

  return (
    <div className="max-w-screen-xl space-y-4">
      <RecentResourceTracker
        kind="share"
        id={share.id}
        name={share.name || "Unnamed share"}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold">
            {share.name || "Unnamed share"}
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {share.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShareSnapshotActions
            initialShareId={share.id}
            projectId={projectId}
            regionId={regionId}
          />
          <Button
            variant="outline"
            disabled={!scope || !canManageShareAccess(share)}
            onClick={() => setGranting(true)}
          >
            <Plus className="size-4" />
            Grant access
          </Button>
          <Button
            size="icon"
            variant="outline"
            title="Edit share"
            disabled={!scope || !canEditShare(share)}
            onClick={() => setAction("edit")}
          >
            <Pencil className="size-4" />
            <span className="sr-only">Edit share</span>
          </Button>
          <Button
            size="icon"
            variant="outline"
            title="Resize share"
            disabled={!scope || !canResizeShare(share)}
            onClick={() => setAction("resize")}
          >
            <Scaling className="size-4" />
            <span className="sr-only">Resize share</span>
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="text-destructive hover:text-destructive"
            title="Delete share"
            disabled={!scope || !canDeleteShare(share)}
            onClick={() => setAction("delete")}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete share</span>
          </Button>
        </div>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Share">
          <DetailField label="Name">{emptyToDash(share.name)}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {share.id}
          </DetailField>
          <DetailField label="Description">
            {emptyToDash(share.description)}
          </DetailField>
          <DetailField label="Status">
            {isShareTransitioning(share) ? (
              <ProgressStatusBadge label={formatManilaStatus(share.status)} />
            ) : (
              <Badge variant={shareStatusVariant(share.status)}>
                {formatManilaStatus(share.status)}
              </Badge>
            )}
          </DetailField>
          <DetailField label="Progress">
            {emptyToDash(share.progress)}
          </DetailField>
          <DetailField label="Capacity">{share.size} GiB</DetailField>
          <DetailField label="Protocol">{share.share_proto}</DetailField>
          <DetailField label="Share Type">
            {share.share_type_name || share.share_type || "-"}
          </DetailField>
          <DetailField label="Availability Zone">
            {emptyToDash(share.availability_zone)}
          </DetailField>
          <DetailField label="Visibility">
            {share.is_public ? "Public" : "Project only"}
          </DetailField>
          <DetailField label="Created">
            {formatUtcTimestamp(share.created_at)}
          </DetailField>
        </DetailSection>

        <DetailSection title="Placement">
          <DetailField label="Share Network">
            {share.share_network_id ? (
              <ResourceLink
                href={`/shared-file-systems/share-networks/${encodeURIComponent(share.share_network_id)}`}
                className="font-mono text-xs"
              >
                {share.share_network_id}
              </ResourceLink>
            ) : (
              "-"
            )}
          </DetailField>
          <DetailField label="Host" className="font-mono text-xs">
            {emptyToDash(share.host)}
          </DetailField>
          <DetailField label="Share Server ID" className="font-mono text-xs">
            {emptyToDash(share.share_server_id)}
          </DetailField>
          <DetailField label="Share Group ID" className="font-mono text-xs">
            {emptyToDash(share.share_group_id)}
          </DetailField>
          <DetailField label="Source Snapshot ID" className="font-mono text-xs">
            {share.snapshot_id ? (
              <ResourceLink
                href={`/shared-file-systems/snapshots/${encodeURIComponent(share.snapshot_id)}`}
              >
                {share.snapshot_id}
              </ResourceLink>
            ) : (
              "-"
            )}
          </DetailField>
        </DetailSection>

        <DetailSection title="Export Locations">
          {exportsQuery.isError ? (
            <DetailField label="Export locations">
              Unavailable for the current role.
            </DetailField>
          ) : exportsQuery.isLoading ? (
            <DetailField label="Export locations">Loading</DetailField>
          ) : exportsQuery.data?.length ? (
            exportsQuery.data.map((location, index) => (
              <DetailField
                key={location.id}
                label={
                  location.preferred ? "Preferred" : `Location ${index + 1}`
                }
                className="font-mono text-xs"
              >
                <span className="break-all">{location.path}</span>
              </DetailField>
            ))
          ) : (
            <DetailField label="Export locations">-</DetailField>
          )}
        </DetailSection>

        <DetailSection title="Metadata">
          {metadata.length ? (
            metadata.map(([key, value]) => (
              <DetailField key={key} label={key}>
                {value}
              </DetailField>
            ))
          ) : (
            <DetailField label="Metadata">-</DetailField>
          )}
        </DetailSection>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Snapshots</h2>
          <p className="text-sm text-muted-foreground">
            Point-in-time copies created from this share.
          </p>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshotsQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Snapshots are unavailable for the current role.
                  </TableCell>
                </TableRow>
              ) : snapshotsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Loading snapshots
                  </TableCell>
                </TableRow>
              ) : snapshotsQuery.data?.length ? (
                snapshotsQuery.data.map((snapshot) => (
                  <TableRow key={snapshot.id}>
                    <TableCell>
                      <ResourceLink
                        href={`/shared-file-systems/snapshots/${encodeURIComponent(snapshot.id)}`}
                      >
                        {snapshot.name || snapshot.id}
                      </ResourceLink>
                    </TableCell>
                    <TableCell>{formatManilaStatus(snapshot.status)}</TableCell>
                    <TableCell>{snapshot.size} GiB</TableCell>
                    <TableCell>
                      {formatUtcTimestamp(snapshot.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No snapshots have been created from this share.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Access rules</h2>
          <p className="text-sm text-muted-foreground">
            Clients must match an access rule before they can mount an export.
          </p>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Access rules are unavailable for the current role.
                  </TableCell>
                </TableRow>
              ) : accessQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Loading access rules
                  </TableCell>
                </TableRow>
              ) : accessQuery.data?.length ? (
                accessQuery.data.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-xs">
                      {rule.access_to}
                    </TableCell>
                    <TableCell>{rule.access_type}</TableCell>
                    <TableCell>
                      {rule.access_level === "rw"
                        ? "Read and write"
                        : "Read only"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {formatManilaStatus(rule.state)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        title="Revoke access"
                        disabled={!scope || !canManageShareAccess(share)}
                        onClick={() => setRevokeRule(rule)}
                      >
                        <ShieldMinus className="size-4" />
                        <span className="sr-only">Revoke access</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No access rules. This share cannot be mounted by a client.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {action && scope ? (
        <ShareMutationDialog
          key={action}
          action={action}
          onComplete={refreshShare}
          onOpenChange={() => setAction(null)}
          scope={scope}
          share={share}
        />
      ) : null}
      {granting && scope ? (
        <GrantShareAccessDialog
          onComplete={refreshAccess}
          onOpenChange={() => setGranting(false)}
          scope={scope}
          shareId={share.id}
        />
      ) : null}
      {revokeRule && scope ? (
        <RevokeShareAccessDialog
          key={revokeRule.id}
          onComplete={refreshAccess}
          onOpenChange={() => setRevokeRule(null)}
          rule={revokeRule}
          scope={scope}
          shareId={share.id}
        />
      ) : null}
    </div>
  );
}

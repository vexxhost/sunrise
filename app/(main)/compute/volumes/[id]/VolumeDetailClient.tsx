"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Camera, Link2, Link2Off, Pencil, Trash2 } from "lucide-react";
import { volumeQueryOptions } from "@/hooks/queries/useVolumes";
import type { Volume } from "@/types/openstack";
import { statuses as volumeStatusDescriptions } from "@/types/openstack/cinder";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  VolumeMutationDialog,
  type VolumeMutationKind,
} from "@/components/Volume/VolumeMutationDialog";
import {
  canAttachVolume,
  canDeleteVolume,
  canDetachVolume,
  canEditVolume,
  canSnapshotVolume,
  isVolumeTransitioning,
} from "@/lib/openstack/storage-lifecycle";
import { formatVolumeStatus } from "@/lib/openstack/storage-status";

interface VolumeDetailClientProps {
  volumeId: string;
  regionId?: string;
  projectId?: string;
}

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatBooleanLike(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return "Yes";
  if (["false", "no", "0"].includes(normalized)) return "No";
  return String(value);
}

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.every((item) => typeof item === "string")
      ? value.join(", ")
      : JSON.stringify(value, null, 2);
  }

  return JSON.stringify(value, null, 2);
}

function volumeStatusVariant(status: string) {
  if (status.startsWith("error")) return "destructive";
  if (["deleting", "error_deleting"].includes(status)) return "destructive";
  if (status === "available") return "default";
  if (["in-use", "reserved"].includes(status)) return "secondary";
  return "outline";
}

function DetailLink({
  href,
  children,
  className,
}: {
  href: string;
  children: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "underline decoration-dotted underline-offset-2 hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function AttachmentValue({ attachment }: { attachment: Volume["attachments"][number] }) {
  return (
    <div className="space-y-1">
      <div>
        <span className="text-muted-foreground">Server: </span>
        {attachment.server_id ? (
          <DetailLink
            href={`/compute/instances/${attachment.server_id}`}
            className="font-mono text-xs"
          >
            {attachment.server_id}
          </DetailLink>
        ) : (
          "-"
        )}
      </div>
      <div>
        <span className="text-muted-foreground">Attachment ID: </span>
        <span className="font-mono text-xs">{emptyToDash(attachment.attachment_id)}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Device: </span>
        <span className="font-mono text-xs">{emptyToDash(attachment.device)}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Host: </span>
        {emptyToDash(attachment.host_name)}
      </div>
      <div>
        <span className="text-muted-foreground">Attached: </span>
        {emptyToDash(attachment.attached_at)}
      </div>
    </div>
  );
}

export function VolumeDetailClient({
  volumeId,
  regionId,
  projectId,
}: VolumeDetailClientProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useMemo(
    () => volumeQueryOptions(regionId, projectId, volumeId),
    [projectId, regionId, volumeId],
  );
  const { data: volume } = useSuspenseQuery({
    ...query,
    refetchInterval: ({ state }) =>
      state.data && isVolumeTransitioning(state.data)
        ? 5_000
        : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<VolumeMutationKind | null>(null);
  const refreshAfterAction = useCallback(async () => {
    if (action !== "delete") {
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
    }
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "volumes"],
    });
  }, [action, projectId, query.queryKey, queryClient, regionId]);
  const navigateAfterDelete = useCallback(() => {
    router.replace("/compute/volumes");
  }, [router]);

  const metadata = useMemo(() => {
    return Object.entries(volume.metadata ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [volume.metadata]);

  const imageMetadata = useMemo(() => {
    return Object.entries(volume.volume_image_metadata ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [volume.volume_image_metadata]);

  const statusDescription = volumeStatusDescriptions[volume.status];

  return (
    <div className="max-w-screen-xl space-y-4">
      <RecentResourceTracker
        kind="volume"
        id={volume.id}
        name={volume.name || "Unnamed volume"}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {volume.name || "Unnamed volume"}
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">{volume.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-10 sm:w-auto sm:px-4"
            aria-label="Attach volume"
            title="Attach volume"
            disabled={!canAttachVolume(volume)}
            onClick={() => setAction("attach")}
          >
            <Link2 className="size-4" />
            <span className="hidden sm:inline">Attach</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-10 sm:w-auto sm:px-4"
            aria-label="Create snapshot"
            title="Create snapshot"
            disabled={!canSnapshotVolume(volume)}
            onClick={() => setAction("snapshot")}
          >
            <Camera className="size-4" />
            <span className="hidden sm:inline">Snapshot</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Edit volume"
            title="Edit volume"
            disabled={!canEditVolume(volume)}
            onClick={() => setAction("edit")}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Detach volume"
            title="Detach volume"
            disabled={!canDetachVolume(volume)}
            onClick={() => setAction("detach")}
          >
            <Link2Off className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-10 text-destructive hover:text-destructive"
            aria-label="Delete volume"
            title="Delete volume"
            disabled={!canDeleteVolume(volume)}
            onClick={() => setAction("delete")}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Volume">
          <DetailField label="Name">{emptyToDash(volume.name)}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {volume.id}
          </DetailField>
          <DetailField label="Description">{emptyToDash(volume.description)}</DetailField>
          <DetailField label="Status">
            <div className="flex min-w-0 flex-col gap-1">
              {isVolumeTransitioning(volume) ? (
                <ProgressStatusBadge label={formatVolumeStatus(volume.status)} />
              ) : (
                <Badge className="w-fit" variant={volumeStatusVariant(volume.status)}>
                  {formatVolumeStatus(volume.status)}
                </Badge>
              )}
              {statusDescription ? (
                <span className="text-xs text-muted-foreground">
                  {statusDescription}
                </span>
              ) : null}
            </div>
          </DetailField>
          <DetailField label="Size">{volume.size} GB</DetailField>
          <DetailField label="Type">{emptyToDash(volume.volume_type)}</DetailField>
          <DetailField label="Availability Zone">
            {emptyToDash(volume.availability_zone)}
          </DetailField>
          <DetailField label="Bootable">{formatBooleanLike(volume.bootable)}</DetailField>
          <DetailField label="Encrypted">{formatBooleanLike(volume.encrypted)}</DetailField>
          <DetailField label="Multi-Attached">
            {formatBooleanLike(volume.multiattach)}
          </DetailField>
          <DetailField label="Shared Targets">
            {formatBooleanLike(volume.shared_targets)}
          </DetailField>
        </DetailSection>

        <DetailSection title="Attachments">
          {volume.attachments.length > 0 ? (
            volume.attachments.map((attachment, index) => (
              <DetailField key={attachment.attachment_id || index} label={`Attachment ${index + 1}`}>
                <AttachmentValue attachment={attachment} />
              </DetailField>
            ))
          ) : (
            <DetailField label="Attachments">-</DetailField>
          )}
        </DetailSection>

        <DetailSection title="Source">
          <DetailField label="Snapshot ID" className="font-mono text-xs">
            {emptyToDash(volume.snapshot_id)}
          </DetailField>
          <DetailField label="Source Volume ID" className="font-mono text-xs">
            {volume.source_volid ? (
              <DetailLink href={`/compute/volumes/${volume.source_volid}`}>
                {volume.source_volid}
              </DetailLink>
            ) : (
              "-"
            )}
          </DetailField>
          <DetailField label="Image Name">
            {emptyToDash(volume.volume_image_metadata?.image_name)}
          </DetailField>
          <DetailField label="Image ID" className="font-mono text-xs">
            {volume.volume_image_metadata?.image_id ? (
              <DetailLink href={`/compute/images/${volume.volume_image_metadata.image_id}`}>
                {volume.volume_image_metadata.image_id}
              </DetailLink>
            ) : (
              "-"
            )}
          </DetailField>
        </DetailSection>

        <DetailSection title="Ownership">
          <DetailField label="Project ID" className="font-mono text-xs">
            {emptyToDash(volume["os-vol-tenant-attr:tenant_id"])}
          </DetailField>
          <DetailField label="User ID" className="font-mono text-xs">
            {emptyToDash(volume.user_id)}
          </DetailField>
          <DetailField label="Group ID" className="font-mono text-xs">
            {emptyToDash(volume.group_id)}
          </DetailField>
          <DetailField label="Consistency Group ID" className="font-mono text-xs">
            {emptyToDash(volume.consistencygroup_id)}
          </DetailField>
          <DetailField label="Provider ID" className="font-mono text-xs">
            {emptyToDash(volume.provider_id)}
          </DetailField>
          <DetailField label="Service UUID" className="font-mono text-xs">
            {emptyToDash(volume.service_uuid)}
          </DetailField>
          <DetailField label="Host" className="font-mono text-xs">
            {emptyToDash(volume["os-vol-host-attr:host"])}
          </DetailField>
          <DetailField label="Cluster Name" className="font-mono text-xs">
            {emptyToDash(volume.cluster_name)}
          </DetailField>
        </DetailSection>

        <DetailSection title="Migration And Replication">
          <DetailField label="Migration Status">
            {emptyToDash(volume.migration_status)}
          </DetailField>
          <DetailField label="Replication Status">
            {emptyToDash(volume.replication_status)}
          </DetailField>
          <DetailField label="Migration State">
            {emptyToDash(volume["os-vol-mig-status-attr:migstat"])}
          </DetailField>
          <DetailField label="Migration Name ID" className="font-mono text-xs">
            {emptyToDash(volume["os-vol-mig-status-attr:name_id"])}
          </DetailField>
          <DetailField label="Consumes Quota">
            {formatBooleanLike(volume.consumes_quota)}
          </DetailField>
        </DetailSection>

        <DetailSection title="Timestamps">
          <DetailField label="Created">{emptyToDash(volume.created_at)}</DetailField>
          <DetailField label="Updated">{emptyToDash(volume.updated_at)}</DetailField>
        </DetailSection>

        <DetailSection title="Metadata">
          {metadata.length > 0 ? (
            metadata.map(([key, value]) => (
              <DetailField key={key} label={key} className="font-mono text-xs">
                {renderValue(value)}
              </DetailField>
            ))
          ) : (
            <DetailField label="Metadata">-</DetailField>
          )}
        </DetailSection>

        <DetailSection title="Image Metadata">
          {imageMetadata.length > 0 ? (
            imageMetadata.map(([key, value]) => (
              <DetailField key={key} label={key} className="font-mono text-xs">
                {renderValue(value)}
              </DetailField>
            ))
          ) : (
            <DetailField label="Image metadata">-</DetailField>
          )}
        </DetailSection>
      </div>
      {action ? (
        <VolumeMutationDialog
          key={`${action}-${volume.id}`}
          action={action}
          volumes={[volume]}
          projectId={projectId}
          regionId={regionId}
          onComplete={refreshAfterAction}
          onDeleteSuccess={navigateAfterDelete}
          onOpenChange={() => setAction(null)}
        />
      ) : null}
    </div>
  );
}

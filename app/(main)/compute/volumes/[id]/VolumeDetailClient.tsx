"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { titleCase } from "title-case";
import { volumeQueryOptions } from "@/hooks/queries/useVolumes";
import type { Volume } from "@/types/openstack";
import { statuses as volumeStatusDescriptions } from "@/types/openstack/cinder";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VolumeDetailClientProps {
  volumeId: string;
  regionId?: string;
  projectId?: string;
}

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function humanize(value: string) {
  return titleCase(value.replace(/[-_]+/g, " "));
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
  const { data: volume } = useSuspenseQuery(
    volumeQueryOptions(regionId, projectId, volumeId),
  );

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
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {volume.name || "Unnamed volume"}
        </h1>
        <p className="font-mono text-sm text-muted-foreground">{volume.id}</p>
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
              <Badge className="w-fit" variant={volumeStatusVariant(volume.status)}>
                {humanize(volume.status)}
              </Badge>
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
    </div>
  );
}

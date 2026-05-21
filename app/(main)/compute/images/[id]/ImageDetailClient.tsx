"use client";

import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import bytes from "bytes";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import type { Image } from "@/types/openstack";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { Badge } from "@/components/ui/badge";
import { imageOperatingSystem } from "@/lib/openstack/image-metadata";

interface ImageDetailClientProps {
  imageId: string;
  regionId?: string;
  projectId?: string;
}

const CORE_IMAGE_FIELDS = new Set([
  "id",
  "name",
  "owner",
  "status",
  "visibility",
  "container_format",
  "disk_format",
  "size",
  "virtual_size",
  "min_disk",
  "min_ram",
  "checksum",
  "os_hash_algo",
  "os_hash_value",
  "created_at",
  "updated_at",
  "protected",
  "os_hidden",
  "tags",
  "locations",
  "direct_url",
  "file",
  "schema",
  "self",
]);

function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return `${bytes(value, { unitSeparator: " " })} (${value} bytes)`;
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

export function ImageDetailClient({
  imageId,
  regionId,
  projectId,
}: ImageDetailClientProps) {
  const { data: image } = useSuspenseQuery(
    imageQueryOptions(regionId, projectId, imageId),
  );

  const customProperties = useMemo(() => {
    return Object.entries(image)
      .filter(([key]) => !CORE_IMAGE_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right));
  }, [image]);

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {image.name || "Unnamed image"}
        </h1>
        <p className="font-mono text-sm text-muted-foreground">{image.id}</p>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Image">
          <DetailField label="Name">{image.name}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {image.id}
          </DetailField>
          <DetailField label="Status">
            <Badge variant={image.status === "active" ? "default" : "secondary"}>
              {image.status}
            </Badge>
          </DetailField>
          <DetailField label="Visibility">{image.visibility}</DetailField>
          <DetailField label="Operating System">{imageOperatingSystem(image)}</DetailField>
          <DetailField label="Owner" className="font-mono text-xs">
            {image.owner}
          </DetailField>
          <DetailField label="Protected">{renderValue(image.protected)}</DetailField>
          <DetailField label="Hidden">{renderValue(image.os_hidden)}</DetailField>
          <DetailField label="Created">{image.created_at}</DetailField>
          <DetailField label="Updated">{image.updated_at}</DetailField>
        </DetailSection>

        <DetailSection title="Format And Size">
          <DetailField label="Disk Format">{image.disk_format}</DetailField>
          <DetailField label="Container Format">{image.container_format}</DetailField>
          <DetailField label="Size">{formatBytes(image.size)}</DetailField>
          <DetailField label="Virtual Size">{formatBytes(image.virtual_size)}</DetailField>
          <DetailField label="Minimum Disk">{image.min_disk} GB</DetailField>
          <DetailField label="Minimum Memory">{image.min_ram} MB</DetailField>
        </DetailSection>

        <DetailSection title="Integrity">
          <DetailField label="Checksum" className="font-mono text-xs">
            {image.checksum}
          </DetailField>
          <DetailField label="Hash Algorithm" className="font-mono text-xs">
            {image.os_hash_algo}
          </DetailField>
          <DetailField label="Hash Value" className="font-mono text-xs">
            {image.os_hash_value}
          </DetailField>
        </DetailSection>

        <DetailSection title="Locations">
          <DetailField label="File" className="font-mono text-xs">
            {image.file}
          </DetailField>
          <DetailField label="Self" className="font-mono text-xs">
            {image.self}
          </DetailField>
          <DetailField label="Direct URL" className="font-mono text-xs">
            {image.direct_url}
          </DetailField>
          <DetailField label="Schema" className="font-mono text-xs">
            {image.schema}
          </DetailField>
        </DetailSection>

        <DetailSection title="Properties">
          {customProperties.length > 0 ? (
            customProperties.map(([key, value]) => (
              <DetailField key={key} label={key} className="font-mono text-xs">
                {renderValue(value)}
              </DetailField>
            ))
          ) : (
            <DetailField label="Custom properties">-</DetailField>
          )}
        </DetailSection>
      </div>
    </div>
  );
}

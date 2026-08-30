"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import bytes from "bytes";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import type { Image } from "@/types/openstack";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Badge } from "@/components/ui/badge";
import { imageOperatingSystem } from "@/lib/openstack/image-metadata";
import { Button } from "@/components/ui/button";
import {
  ImageMutationDialog,
  type ImageMutationKind,
} from "@/components/Image/ImageMutationDialog";
import {
  canDeleteImage,
  canEditImage,
  isImageTransitioning,
} from "@/lib/openstack/image-lifecycle";

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
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useMemo(
    () => imageQueryOptions(regionId, projectId, imageId),
    [imageId, projectId, regionId],
  );
  const { data: image } = useSuspenseQuery({
    ...query,
    refetchInterval: ({ state }) =>
      state.data && isImageTransitioning(state.data) ? 5_000 : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<ImageMutationKind | null>(null);
  const refreshAfterAction = useCallback(async () => {
    if (action !== "delete") {
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
    }
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "images"],
    });
  }, [action, projectId, query.queryKey, queryClient, regionId]);
  const navigateAfterDelete = useCallback(() => {
    router.replace("/compute/images");
  }, [router]);

  const customProperties = useMemo(() => {
    return Object.entries(image)
      .filter(([key]) => !CORE_IMAGE_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right));
  }, [image]);

  return (
    <div className="max-w-screen-xl space-y-4">
      <RecentResourceTracker
        kind="image"
        id={image.id}
        name={image.name || "Unnamed image"}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {image.name || "Unnamed image"}
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">{image.id}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-10 gap-2"
            disabled={!canEditImage(image, projectId)}
            onClick={() => setAction("edit")}
          >
            <Pencil className="size-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-10 text-destructive hover:text-destructive"
            aria-label="Delete image"
            title="Delete image"
            disabled={!canDeleteImage(image, projectId)}
            onClick={() => setAction("delete")}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Image">
          <DetailField label="Name">{image.name}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {image.id}
          </DetailField>
          <DetailField label="Status">
            {isImageTransitioning(image) ? (
              <ProgressStatusBadge label={image.status.replace(/_/g, " ")} />
            ) : (
              <Badge variant={image.status === "active" ? "default" : "secondary"}>
                {image.status}
              </Badge>
            )}
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
      {action ? (
        <ImageMutationDialog
          key={`${action}-${image.id}`}
          action={action}
          images={[image]}
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

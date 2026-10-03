"use client";

import { useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { Volume } from "@/types/openstack";
import { Server } from "@/types/openstack";
import { volumeQueryOptions } from "@/hooks/queries/useVolumes";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import { useMemo, useState, useTransition } from "react";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  detachVolumeAction,
  updateVolumeAttachmentAction,
} from "@/lib/openstack/cinder-actions";
import { canModifyServerAttachments } from "@/lib/openstack/server-lifecycle";
import {
  canDetachVolume,
  isVolumeTransitioning,
} from "@/lib/openstack/storage-lifecycle";
import { Link2Off } from "lucide-react";

interface VolumeInfoProps {
  server: Server;
  regionId?: string;
  projectId?: string;
}

const TRANSITION_REFETCH_INTERVAL_MS = 5_000;

export default function VolumeInfo({
  server,
  regionId,
  projectId,
}: VolumeInfoProps) {
  const queryClient = useQueryClient();
  const [detachTarget, setDetachTarget] = useState<Volume | null>(null);
  const [detachError, setDetachError] = useState<string | null>(null);
  const [detachPending, startDetach] = useTransition();
  const [attachmentPolicyTarget, setAttachmentPolicyTarget] = useState<
    string | null
  >(null);
  const [attachmentPolicyError, setAttachmentPolicyError] = useState<
    string | null
  >(null);
  const [attachmentPolicyPending, startAttachmentPolicyUpdate] =
    useTransition();
  const serverVolumeAttachments =
    server["os-extended-volumes:volumes_attached"] ?? [];
  const serverVolumeKeys = serverVolumeAttachments.map((volume) => volume.id);

  // Fetch all volumes in parallel using useSuspenseQueries
  const volumeQueries = useSuspenseQueries({
    queries: serverVolumeKeys.map((id) => ({
      ...volumeQueryOptions(regionId, projectId, id),
      refetchInterval: (query: { state: { data?: Volume } }) =>
        query.state.data && isVolumeTransitioning(query.state.data)
          ? TRANSITION_REFETCH_INTERVAL_MS
          : false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    })),
  });

  // Combine all volume data
  const volumes = useMemo(() => {
    return volumeQueries.map((query) => query.data);
  }, [volumeQueries]);

  // Determine image ID - either from server or from boot volume
  const imageId = useMemo(() => {
    if (server.image) {
      return server.image.id;
    }
    const bootVolume = volumes.find(
      (volume: Volume) => volume.volume_image_metadata,
    );
    return bootVolume?.volume_image_metadata?.image_id;
  }, [server.image, volumes]);

  const imageQueryList = useMemo(() => {
    if (!server.image || !imageId) {
      return [];
    }

    return [imageQueryOptions(regionId, projectId, imageId)];
  }, [imageId, projectId, regionId, server.image]);

  // Always run the hook; use an empty query list when no image is needed.
  const imageQueries = useSuspenseQueries({
    queries: imageQueryList,
  });
  const image = imageQueries[0]?.data;

  const imageName = useMemo(() => {
    if (server.image && image) {
      return image.name;
    }
    const bootVolume = volumes.find(
      (volume: Volume) => volume.volume_image_metadata,
    );
    return bootVolume?.volume_image_metadata?.image_name;
  }, [server.image, image, volumes]);

  const isRootVolume = (volume: Volume) => {
    const device = volume.attachments.find(
      (attachment) => attachment.server_id === server.id,
    )?.device;
    const rootDevice = server["OS-EXT-SRV-ATTR:root_device_name"];
    if (rootDevice && device) return rootDevice === device;
    return !server.image && serverVolumeKeys[0] === volume.id;
  };

  const confirmDetach = () => {
    if (!detachTarget || !projectId || !regionId) return;
    startDetach(async () => {
      setDetachError(null);
      const result = await detachVolumeAction(
        { projectId, regionId },
        { volumeId: detachTarget.id, serverId: server.id },
      );
      if (!result.ok) {
        setDetachError(result.error.message);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "server", server.id],
        }),
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "servers"],
        }),
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "volumes"],
        }),
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "volume", detachTarget.id],
        }),
      ]);
      queryClient.setQueryData<Server>(
        [regionId, projectId, "server", server.id],
        (current) =>
          current
            ? {
                ...current,
                "os-extended-volumes:volumes_attached": (
                  current["os-extended-volumes:volumes_attached"] ?? []
                ).filter(({ id }) => id !== detachTarget.id),
              }
            : current,
      );
      setDetachTarget(null);
    });
  };

  const updateDeleteWithInstance = (
    volume: Volume,
    deleteOnTermination: boolean,
  ) => {
    if (!projectId || !regionId || isRootVolume(volume)) return;
    setAttachmentPolicyTarget(volume.id);
    startAttachmentPolicyUpdate(async () => {
      setAttachmentPolicyError(null);
      const result = await updateVolumeAttachmentAction(
        { projectId, regionId },
        {
          volumeId: volume.id,
          serverId: server.id,
          deleteOnTermination,
        },
      );
      if (!result.ok) {
        setAttachmentPolicyError(result.error.message);
        setAttachmentPolicyTarget(null);
        return;
      }

      const updateServer = (current: Server | undefined) =>
        current
          ? {
              ...current,
              "os-extended-volumes:volumes_attached": (
                current["os-extended-volumes:volumes_attached"] ?? []
              ).map((attachment) =>
                attachment.id === volume.id
                  ? {
                      ...attachment,
                      delete_on_termination: deleteOnTermination,
                    }
                  : attachment,
              ),
            }
          : current;

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "server", server.id],
        }),
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "servers"],
        }),
      ]);
      queryClient.setQueryData<Server>(
        [regionId, projectId, "server", server.id],
        updateServer,
      );
      queryClient.setQueryData<Server[]>(
        [regionId, projectId, "servers"],
        (current) =>
          current?.map((item) =>
            item.id === server.id ? (updateServer(item) ?? item) : item,
          ),
      );
      setAttachmentPolicyTarget(null);
    });
  };

  return (
    <>
      <DetailSection title="Storage and boot">
        <DetailField label="Boot source">
          {imageId ? (
            <div className="min-w-0">
              <ResourceLink
                href={`/compute/images/${encodeURIComponent(imageId)}`}
              >
                {imageName || "Image"}
              </ResourceLink>
              <p
                className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                title={imageId}
              >
                <ResourceLink
                  href={`/compute/images/${encodeURIComponent(imageId)}`}
                  className="font-mono text-xs"
                >
                  {imageId}
                </ResourceLink>
              </p>
            </div>
          ) : (
            "Unknown"
          )}
        </DetailField>
        {serverVolumeKeys.length > 0 ? (
          volumes?.map((volume, index) => {
            const rootVolume = isRootVolume(volume);
            const serverAttachment = serverVolumeAttachments.find(
              (attachment) => attachment.id === volume.id,
            );
            const updatingPolicy =
              attachmentPolicyPending && attachmentPolicyTarget === volume.id;

            return (
              <DetailField key={volume.id ?? index} label="Attached volume">
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <ResourceLink
                        href={`/compute/volumes/${encodeURIComponent(volume.id)}`}
                      >
                        {volume.name || volume.id}
                      </ResourceLink>
                      {volume.attachments[0]?.device ? (
                        <span className="text-muted-foreground">
                          {` on ${volume.attachments[0].device}`}
                        </span>
                      ) : null}
                      {rootVolume ? (
                        <p className="text-xs text-muted-foreground">
                          Root volume
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      aria-label={`Detach ${volume.name || volume.id}`}
                      title={
                        rootVolume
                          ? "The root volume cannot be detached"
                          : "Detach volume"
                      }
                      disabled={
                        rootVolume ||
                        !canDetachVolume(volume) ||
                        !canModifyServerAttachments(server)
                      }
                      onClick={() => {
                        setDetachError(null);
                        setDetachTarget(volume);
                      }}
                    >
                      <Link2Off className="size-4" />
                    </Button>
                  </div>
                  {!rootVolume ? (
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={Boolean(
                          serverAttachment?.delete_on_termination,
                        )}
                        disabled={
                          attachmentPolicyPending ||
                          !canModifyServerAttachments(server)
                        }
                        onCheckedChange={(checked) =>
                          updateDeleteWithInstance(volume, checked === true)
                        }
                      />
                      <span>Delete with instance</span>
                      {updatingPolicy ? <Spinner className="size-3" /> : null}
                    </label>
                  ) : null}
                </div>
              </DetailField>
            );
          })
        ) : (
          <DetailField label="Root disk">
            {server.flavor.disk} GB instance disk · no persistent volumes
            attached
          </DetailField>
        )}
        {attachmentPolicyError ? (
          <MutationAlert>{attachmentPolicyError}</MutationAlert>
        ) : null}
      </DetailSection>

      <MutationConfirmationDialog
        open={detachTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetachTarget(null);
            setDetachError(null);
          }
        }}
        title="Detach volume?"
        description="The guest will lose access to this block device. Unmount filesystems before detaching to avoid data loss."
        confirmLabel="Detach volume"
        pendingLabel="Detaching"
        pending={detachPending}
        error={detachError}
        variant="destructive"
        onConfirm={confirmDetach}
      >
        {detachTarget ? (
          <div className="rounded-md border px-3 py-2 text-sm">
            {detachTarget.name || detachTarget.id} · {detachTarget.size} GiB
          </div>
        ) : null}
      </MutationConfirmationDialog>
    </>
  );
}

'use client';

import { useSuspenseQueries } from "@tanstack/react-query";
import { Volume } from "@/types/openstack";
import { Server } from "@/types/openstack";
import { volumeQueryOptions } from "@/hooks/queries/useVolumes";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import { useMemo } from "react";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";

interface VolumeInfoProps {
    server: Server;
    regionId?: string;
    projectId?: string;
}

export default function VolumeInfo({ server, regionId, projectId }: VolumeInfoProps) {
    const serverVolumeKeys = server["os-extended-volumes:volumes_attached"].map(
        (volume: { id: string }) => volume.id,
    );

    // Fetch all volumes in parallel using useSuspenseQueries
    const volumeQueries = useSuspenseQueries({
        queries: serverVolumeKeys.map(id => volumeQueryOptions(regionId, projectId, id))
    });

    // Combine all volume data
    const volumes = useMemo(() => {
        return volumeQueries.map(query => query.data);
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

    return (
        <>
          <DetailSection title="Metadata">
            <DetailField label="Key Name">{server.key_name}</DetailField>
            <DetailField label="Image ID" className="font-mono text-xs">
              {imageId}
            </DetailField>
            <DetailField label="Image Name">{imageName}</DetailField>
          </DetailSection>
          <DetailSection title="Volumes Attached">
          {serverVolumeKeys.length > 0 ? (
            volumes?.map((key, index) => (
                <DetailField key={key.id ?? index} label="Attached to">
                  {key.name} on {key.attachments[0].device}
                </DetailField>
            ))
          ) : (
            <DetailField label="Volumes">No volumes attached</DetailField>
          )}
          </DetailSection>
        </>
    )
}

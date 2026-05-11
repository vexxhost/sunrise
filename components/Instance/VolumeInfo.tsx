'use client';

import { useSuspenseQueries } from "@tanstack/react-query";
import { Volume } from "@/types/openstack";
import { Server } from "@/types/openstack";
import { volumeQueryOptions } from "@/hooks/queries/useVolumes";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import { useMemo } from "react";

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

    // Always run the hook; disable when no image is needed.
    const imageQueries = useSuspenseQueries({
        queries:
            server.image && imageId
                ? [imageQueryOptions(regionId, projectId, imageId)]
                : [],
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
           <div className="font-bold text-l mt-2 p-4">Metadata</div>
          <div className="flex flex-row ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-xs">Key Name:</div>
            <div className="basis-3/4 text-xs">{server.key_name}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Image ID:</div>
            <div className="basis-3/4">{imageId}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Image Name:</div>
            <div className="basis-3/4">{imageName}</div>
          </div>
          <div className="font-bold text-l mt-2 p-4">Volumes Attached</div>
          {serverVolumeKeys.length > 0 ? (
            volumes?.map((key, index) => (
                <div key={index} className="flex flex-row ml-2 pl-2 text-xs">
                  <div className="basis-1/4 font-bold text-m">Attached to</div>
                  <div className="basis-3/4">
                    {key.name} on {key.attachments[0].device}{" "}
                  </div>
                </div>
            ))
          ) : (
            <p className="ml-2 pl-2 text-xs text-gray-500">
              No Volumes Attached
            </p>
          )}
        </>
    )
}

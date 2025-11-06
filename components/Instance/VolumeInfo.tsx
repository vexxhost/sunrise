'use client';

import { useQuery } from "@tanstack/react-query";
import { Volume } from "@/types/openstack";
import { Server } from "@/types/openstack";
import { volumeQueryOptions } from "@/hooks/queries/useVolumes";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import { useKeystoneStore } from "@/stores/useKeystoneStore";
import { useMemo } from "react";

export default function VolumeInfo({ server }: { server: Server }) {
    const { region, project } = useKeystoneStore();

    const serverVolumeKeys = server["os-extended-volumes:volumes_attached"].map(
        (volume: { id: string }) => volume.id,
    );

    // Call useQuery for each volume ID - TanStack Query handles parallel requests and caching
    const volumeQueries = serverVolumeKeys.map(id =>
        useQuery(volumeQueryOptions(region?.id, project?.id, id))
    );

    // Combine all volume data
    const volumes = useMemo(() => {
        return volumeQueries.map(query => query.data).filter(Boolean) as Volume[];
    }, [volumeQueries.map(q => q.data).join()]);

    // Determine image ID - either from server or from boot volume
    const imageId = useMemo(() => {
        if (server.image) {
            return server.image.id;
        }
        // Get image from volume if server has no image
        if (volumes) {
            const bootVolume = volumes.find(
                (volume: Volume) => volume.volume_image_metadata,
            );
            return bootVolume?.volume_image_metadata?.image_id;
        }
        return undefined;
    }, [server.image, volumes]);

    const { data: image } = useQuery({
        ...imageQueryOptions(region?.id, project?.id, imageId || ''),
        enabled: !!imageId && !!server.image
    });

    const imageName = useMemo(() => {
        if (server.image && image) {
            return image.name;
        }
        // Get image name from volume metadata if available
        if (volumes) {
            const bootVolume = volumes.find(
                (volume: Volume) => volume.volume_image_metadata,
            );
            return bootVolume?.volume_image_metadata?.image_name;
        }
        return undefined;
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

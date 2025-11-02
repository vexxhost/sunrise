'use client';

import { useState, useCallback, useRef } from "react";
import { createInstanceColumns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchOptions } from "./meta";
import { Server, Flavor } from "@/lib/nova";
import { Volume } from "@/lib/cinder";
import { Image } from "@/lib/glance";
import { nova, cinder, glance } from "@/lib/client";
import { Server as ServerIcon } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export function InstancesTable() {
  const { region } = useRegion();
  const [images, setImages] = useState<{ [key: string]: string }>({});
  const [flavors, setFlavors] = useState<{ [key: string]: string }>({});
  const [volumeImageIds, setVolumeImageIds] = useState<{ [key: string]: string }>({});
  const contextFetched = useRef(false);
  const previousRegion = useRef(region);

  // Reset context when region changes
  if (previousRegion.current !== region) {
    contextFetched.current = false;
    previousRegion.current = region;
  }

  // Fetch servers and context data together
  const fetchServers = useCallback(async () => {
    // Fetch servers immediately
    const serversPromise = nova.listServers();

    // Fetch context data in parallel (but only once per region)
    if (!contextFetched.current) {
      contextFetched.current = true;

      Promise.all([
        cinder.listVolumes(),
        glance.listImages(),
        nova.listFlavors(),
      ]).then(([volumesData, imagesData, flavorsData]) => {
        // Extract volume image IDs
        const volImageIds = volumesData.reduce(
          (acc: { [key: string]: string }, volume: Volume) => {
            if (volume.volume_image_metadata) {
              acc[volume.id] = volume.volume_image_metadata.image_id;
            }
            return acc;
          },
          {}
        );
        setVolumeImageIds(volImageIds);

        // Map images
        const imagesMap: { [key: string]: string } = {};
        imagesData.images?.forEach((image: Image) => {
          imagesMap[image.id] = image.name;
        });
        setImages(imagesMap);

        // Map flavors
        const flavorsMap: { [key: string]: string } = {};
        flavorsData.flavors?.forEach((flavor: Flavor) => {
          flavorsMap[flavor.id] = flavor.name;
        });
        setFlavors(flavorsMap);
      }).catch((error) => {
        console.error("Failed to load context data:", error);
      });
    }

    // Return servers data
    const data = await serversPromise;
    return data.servers;
  }, [region]);

  const columns = createInstanceColumns({ images, flavors, volumeImageIds });

  return (
    <DataTable
      fetchData={fetchServers}
      columns={columns}
      searchOptions={searchOptions}
      defaultColumnVisibility={{
        id: false,
        alert: false,
        'OS-EXT-AZ:availability_zone': false,
        task: false
      }}
      resourceName="instance"
      emptyIcon={ServerIcon}
    />
  );
}

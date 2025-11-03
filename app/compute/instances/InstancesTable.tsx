'use client';

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createInstanceColumns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchOptions } from "./meta";
import { Volume } from "@/lib/cinder";
import { Image } from "@/lib/glance";
import { Flavor } from "@/lib/nova";
import { nova, cinder, glance } from "@/lib/client";
import { Server as ServerIcon } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export function InstancesTable() {
  const { region } = useRegion();

  // Fetch servers
  const { data: serversData, isLoading: isLoadingServers, isRefetching: isRefetchingServers, refetch: refetchServers } = useQuery({
    queryKey: ['servers', region],
    queryFn: async () => {
      const data = await nova.listServers();
      return data.servers;
    },
  });

  // Fetch volumes
  const { data: volumesData } = useQuery({
    queryKey: ['volumes', region],
    queryFn: () => cinder.listVolumes(),
  });

  // Fetch images
  const { data: imagesData } = useQuery({
    queryKey: ['images', region],
    queryFn: async () => {
      const data = await glance.listImages();
      return data.images;
    },
  });

  // Fetch flavors
  const { data: flavorsData } = useQuery({
    queryKey: ['flavors', region],
    queryFn: async () => {
      const data = await nova.listFlavors();
      return data.flavors;
    },
  });

  // Process volume image IDs
  const volumeImageIds = useMemo(() => {
    if (!volumesData) return {};
    return volumesData.reduce(
      (acc: { [key: string]: string }, volume: Volume) => {
        if (volume.volume_image_metadata) {
          acc[volume.id] = volume.volume_image_metadata.image_id;
        }
        return acc;
      },
      {}
    );
  }, [volumesData]);

  // Process images map
  const images = useMemo(() => {
    if (!imagesData) return {};
    const imagesMap: { [key: string]: string } = {};
    imagesData.forEach((image: Image) => {
      imagesMap[image.id] = image.name;
    });
    return imagesMap;
  }, [imagesData]);

  // Process flavors map
  const flavors = useMemo(() => {
    if (!flavorsData) return {};
    const flavorsMap: { [key: string]: string } = {};
    flavorsData.forEach((flavor: Flavor) => {
      flavorsMap[flavor.id] = flavor.name;
    });
    return flavorsMap;
  }, [flavorsData]);

  const columns = createInstanceColumns({ images, flavors, volumeImageIds });

  return (
    <DataTable
      data={serversData || []}
      isLoading={isLoadingServers}
      isRefetching={isRefetchingServers}
      refetch={refetchServers}
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

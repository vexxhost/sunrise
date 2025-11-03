'use client';

import { useMemo } from "react";
import { createInstanceColumns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { Volume } from "@/types/openstack";
import { Image } from "@/types/openstack";
import { Flavor } from "@/types/openstack";
import { Server as ServerIcon } from "lucide-react";
import { useServers, useFlavors, useVolumes, useImages } from "@/hooks/queries";

export default function Page() {
  console.log('[InstancesPage] render');

  // Fetch servers
  const { data: serversData, isLoading: isLoadingServers, isRefetching: isRefetchingServers, refetch: refetchServers } = useServers();

  // Fetch volumes
  const { data: volumesData } = useVolumes();

  // Fetch images
  const { data: imagesData } = useImages();

  // Fetch flavors
  const { data: flavorsData } = useFlavors();

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

  const columns = useMemo(
    () => createInstanceColumns({ images, flavors, volumeImageIds }),
    [images, flavors, volumeImageIds]
  );

  return (
    <DataTable
      data={serversData || []}
      isLoading={isLoadingServers}
      isRefetching={isRefetchingServers}
      refetch={refetchServers}
      columns={columns}
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

import {
  Flavor,
  listFlavors,
  listServers,
} from "@/lib/nova";
import { type Volume, listVolumes } from "@/lib/cinder";
import { Image, listImages } from "@/lib/glance";
import { InstancesTable } from "./InstancesTable";

export default async function Page() {
  // Fetch all data
  const servers = await listServers();

  // Get all volumes and extract image ids for boot volumes
  const volumes = await listVolumes();
  const volumeImageIds = volumes.reduce(
    (acc: { [key: string]: string }, volume: Volume) => {
      if (volume.volume_image_metadata) {
        acc[volume.id] = volume.volume_image_metadata.image_id;
      }
      return acc;
    },
    {},
  );

  // Get Associated Images
  const imagesFull = await listImages();
  let images: { [key: string]: string } = {};
  imagesFull.images &&
    imagesFull.images.map((image: Image) => {
      images[image.id] = image.name;
    });

  // Get Associated Flavors
  const flavorsFull = await listFlavors();
  let flavors: { [key: string]: string } = {};
  flavorsFull.flavors &&
    flavorsFull.flavors.map((flavor: Flavor) => {
      flavors[flavor.id] = flavor.name;
    });

  // Create promise for DataTableAsync
  const serversPromise = Promise.resolve(servers["servers"]);

  return (
    <InstancesTable
      serversPromise={serversPromise}
      images={images}
      flavors={flavors}
      volumeImageIds={volumeImageIds}
    />
  );
}

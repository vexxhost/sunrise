import {
  type ListServersOptions,
  Flavor,
  listFlavors,
  listServers,
} from "@/lib/nova";
import { type Volume, listVolumes } from "@/lib/cinder";
import { Image, listImages } from "@/lib/glance";
import { Suspense } from "react";
import { Loader } from "@/components/Loader";
import Table from "./Table";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    sort_dir?: string;
    sort_key?: string;
  }>;
}) {
  // @bug? the only working searchOption for nova api is name at the moment
  // @todo add support for image_name and flavor_name to SearchOptions

  const defaultServerOptions = {
    sort_dir: "desc",
    sort_key: "created_at",
  };

  // @todo filter searchParams against searchOptions + sort_key, sort_dir
  const params = await searchParams;
  const serverOptions = Object.assign(defaultServerOptions, params);

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-4xl font-semibold leading-6 text-gray-900">
            Instances
          </h1>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="p-20 flex justify-center items-center">
            <Loader />
          </div>
        }
      >
        <InstancesTable options={serverOptions} />
      </Suspense>
    </div>
  );
}

async function InstancesTable({ options }: { options: ListServersOptions }) {
  // Get Servers
  const servers = await listServers(options);

  // Get all volumes and extract image ids for boot volumes
  const volumes = await listVolumes();
  const volumeImageIds = volumes.reduce(
    (acc: { [key: string]: string }, volume: Volume) => {
      // @todo make sure we have the boot volume
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

  return (
    <Table
      servers={servers["servers"]}
      images={images}
      flavors={flavors}
      volumeImageIds={volumeImageIds}
      options={options}
    />
  );
}

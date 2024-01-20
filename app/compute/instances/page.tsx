import { session } from "@/lib/session"
import { startFederatedAuth } from "@/lib/auth";
import { type ListServersOptions, type Server, Flavor, listFlavors, listServers } from "@/lib/nova"
import { Image, listImages } from "@/lib/glance"
import { Suspense } from "react";
import { Loader } from "@/components/Loader"
import Table from "./Table";

export const revalidate = 10;

export default async function Page({ 
  searchParams 
}: {
  searchParams?: {
    sort_dir?: string, 
    sort_key?: string
  }
}) {
  const unscopedToken = await session().get('keystone_unscoped_token');
  if (!unscopedToken) {
    return startFederatedAuth();
  }

  const project = await session().get('selectedProject')

  // @bug? the only working searchOption for nova api is name at the moment
  // @todo add support for image_name and flavor_name to SearchOptions

  const defaultServerOptions = {
    sort_dir: 'desc',
    sort_key: 'created_at',
  }

  // @todo filter searchParams against searchOptions + sort_key, sort_dir
  const serverOptions = Object.assign(defaultServerOptions, searchParams)

  return <div>
    <div className="sm:flex sm:items-center">
      <div className="sm:flex-auto">
        <h1 className="text-4xl font-semibold leading-6 text-gray-900">Instances</h1>
      </div>
    </div>
    <Suspense fallback={<div className="p-20 flex justify-center items-center"><Loader /></div>}>
      <InstancesTable options={serverOptions} />
    </Suspense>
  </div>
}

async function InstancesTable({options}: { options: ListServersOptions}) {
  // Get Servers
  const servers = await listServers(options);

  // Get Attached Volumes for getting volume images
  const attachedVolumeIds = servers["servers"].reduce((acc: string[], server: Server) => {
    server['os-extended-volumes:volumes_attached'].map((volume: {id: string}) => {
      acc.push(volume.id)
    })
    return acc
  }, [] as string[])
  // @todo query volumes for image ids
  // @todo from volumes, get boot volume, then image_id from boot volume
  // @todo OR create array of volume images used by server as reference

  // Get unique images from servers for images query
  const serverImageIds = servers["servers"].reduce((acc: string[], server: Server) => {
    if (server.image !== '') {
      acc.push(server.image)
    }
    return acc
  }, [] as string[])

  // @todo merge attachedVolumeIds and serverImageIds before fetching images

  // Get Associated Images
  const imagesFull = await listImages();
  let images:{[key: string]: string} = {}
  imagesFull.images && imagesFull.images.map((image: Image) => {
    images[image.id] = image.name
  })

  // Get Associated Flavors
  const flavorsFull = await listFlavors();
  let flavors:{[key: string]: string} = {}
  flavorsFull.flavors && flavorsFull.flavors.map((flavor: Flavor) => {
    flavors[flavor.id] = flavor.name
  })
  
  return <Table servers={servers["servers"]} images={images} flavors={flavors} options={options} />
}

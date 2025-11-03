import { getVolumes, Volume } from "@/lib/cinder";
import { getImage } from "@/lib/glance";
import { Server } from "@/lib/nova";

export default async function VolumeInfo({ server }: { server: Server }){
    const serverVolumeKeys = server["os-extended-volumes:volumes_attached"].map(
        (volume: { id: string }) => volume.id,
      );
  let volumes = undefined;
  //do we have volumes attached to this server?
  volumes = await getVolumes(serverVolumeKeys);
  // now we need to see if we need a volume image or a boot image for the server
  let imageId = undefined;
  let image = undefined;
  let imageName = undefined;
  //if the server image is null, we need to get the image from the volume
  if (server.image) {
    imageId = server.image.id;
    image = await getImage(imageId.toString());
    imageName = image.name;
  } else {
    // we need to get the image id and name from the volume
    if (volumes) {
      const volume = volumes.find(
        (volume: Volume) => volume.volume_image_metadata,
      );
      if (volume && volume.volume_image_metadata) {
        imageId = volume.volume_image_metadata.image_id;
        imageName = volume.volume_image_metadata.image_name;
      }
    }
  }
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
            volumes.map((key, index) => (
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
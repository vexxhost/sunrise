import React from "react";
import { session } from "@/lib/session";
import {type Server,Flavor,getInstance,getFlavor,AddressItem,} from "@/lib/nova";
import { type Volume, listVolumes, getVolume } from "@/lib/cinder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getVolumes } from "@/lib/cinder";
import { getImage } from "@/lib/glance";
import { formattedTimeSinceDate } from "@/lib/isoDateUtils";
import { formatMBtoGB } from "@/lib/utils";
import { SecurityGroup,SecurityGroupRule,listSecurityGroups,} from "@/lib/network";

interface Params {
  id: string;
}

export function formatSecurityGroupInfo(
  groupName: string,
  securityGroups: SecurityGroup[]
): React.ReactNode[] | null {
  let securityGroupInfo: React.ReactNode[] = [];

  const foundSecGroup = securityGroups.find(
    (secGroup) => secGroup.name === groupName
  );
  if (!foundSecGroup) return null;

  if (foundSecGroup && foundSecGroup.security_group_rules) {
    securityGroupInfo = foundSecGroup.security_group_rules.map(
      (rule: SecurityGroupRule) => (
        <li key={rule.id}>
          ALLOW {rule.ethertype}
          {rule.protocol && ` ${rule.protocol}`}
          {(rule.port_range_min !== null || rule.port_range_max !== null) &&
            ` ${rule.port_range_min}-${rule.port_range_max}`}
          {` ${rule.remote_group_id ? "from" : "to"} ${
            getGroupNameFromId(rule.remote_group_id, securityGroups) ??
            (rule.remote_ip_prefix ||
              (rule.ethertype === "IPv6" ? "::/0" : "0.0.0.0/0"))
          }`}
        </li>
      )
    );
  }

  return securityGroupInfo.length > 0 ? securityGroupInfo : null;
}

export function getGroupNameFromId(
  id: string,
  securityGroups: SecurityGroup[]
) {
  const foundSecGroup = securityGroups.find((secGroup) => secGroup.id === id);

  return foundSecGroup ? foundSecGroup.name : undefined;
}

export default async function Instance({ params }: { params: Params }) {
  const project = await session().get("selectedProject");
  const server: Server = await getInstance(params.id);
  const serverAddressKeys = Object.keys(server.addresses);
  const serverVolumeKeys = server["os-extended-volumes:volumes_attached"].map(
    (volume: { id: string }) => volume.id
  );
  const secGroupNames = server["security_groups"].map(
    (secGroup: { name: string }) => secGroup.name
  );
  const flavor: Flavor = await getFlavor(server.flavor.id);
  const securityGroups = await listSecurityGroups();
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
        (volume: Volume) => volume.volume_image_metadata
      );
      if (volume && volume.volume_image_metadata) {
        imageId = volume.volume_image_metadata.image_id;
        imageName = volume.volume_image_metadata.image_name;
      }
    }
  }

  return (
    <Tabs defaultValue="overview" className="max-w-screen-xl">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="interfaces">Interfaces</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="max-w-screen-l">
        <div className="font-bold text-l mt-4  pb-6"> {server.name} </div>
        <div className="max-w-screen-xl mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-xl">
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold">Name:</div>
            <div className="basis-3/4">{server.name}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold">ID:</div>
            <div className="basis-3/4">{server.id}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold">Description:</div>
            <div className="basis-3/4"> </div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Project ID:</div>
            <div className="basis-3/4">{project.id}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Status:</div>
            <div className="basis-3/4">{server.status}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Power State:</div>
            <div className="basis-3/4">{server["OS-EXT-STS:power_state"]}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Availability Zone:</div>
            <div className="basis-3/4">
              {server["OS-EXT-AZ:availability_zone"]}
            </div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 fon:51 p.m.t-bold text-m">Created:</div>
            <div className="basis-3/4">{server.created}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Age:</div>
            <div className="basis-3/4">
              {formattedTimeSinceDate(server.created)}
            </div>
          </div>
          <div className="font-bold text-l mt-2 p-4">Specs</div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Flavor Name:</div>
            <div className="basis-3/4">{flavor.name.toString()}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">Flavor ID:</div>
            <div className="basis-3/4">{flavor.id}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">RAM:</div>
            <div className="basis-3/4">{formatMBtoGB(flavor.ram)}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">VCPU:</div>
            <div className="basis-3/4">{flavor.vcpus}</div>
          </div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            <div className="basis-1/4 font-bold text-m">DISK:</div>
            <div className="basis-3/4">{flavor.disk} GB</div>
          </div>
          <div className="font-bold text-l mt-2 p-4"> IP Addresses</div>
          <div className="flex flex-row  ml-2 pl-2 text-xs">
            {serverAddressKeys.map((key, index) => (
              <React.Fragment key={index}>
                <div className="basis-1/4 font-bold text-m">{key}:</div>
                <div className="basis-3/4">
                  {server.addresses[key]
                    .map((address: AddressItem) => address.addr)
                    .join(", ")}
                </div>
              </React.Fragment>
            ))}
          </div>
          <div className="font-bold text-l mt-2 p-4">Security Groups</div>
          {secGroupNames.map((secGroupName, index) => (
            <div className="flex flex-row  ml-2 pl-2 text-xs" key={index}>
              <div className="basis-1/4 mb-2 pb-2">
                <p className="font-bold text-xs">{secGroupName}</p>
              </div>
              <div className="basis-3/4 mb-2 pb-2">
                <ol>{formatSecurityGroupInfo(secGroupName, securityGroups)}</ol>
              </div>
            </div>
          ))}
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
              <React.Fragment key={index}>
                <div className="flex flex-row ml-2 pl-2 text-xs">
                  <div className="basis-1/4 font-bold text-m">Attached to</div>
                  <div className="basis-3/4">
                    {key.name} on {key.attachments[0].device}{" "}
                  </div>
                </div>
              </React.Fragment>
            ))
          ) : (
            <p className="ml-2 pl-2 text-xs text-gray-500">
              No Volumes Attached
            </p>
          )}
          <div className="flex flex-row  ml-2 mb-2 pl-1 pb-2 text-xs"></div>
        </div>
      </TabsContent>
      <TabsContent value="interfaces"></TabsContent>
    </Tabs>
  );
}

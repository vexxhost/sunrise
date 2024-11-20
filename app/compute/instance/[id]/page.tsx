
import {
  InterfaceAttachment,
  type Server,
  getInstance,
  getPortInterfaces
} from "@/lib/nova";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VolumeInfo from "@/components/Instance/VolumeInfo";
import SecurityGroupListByNames from "@/components/Instance/GroupList";
import { ServerIPAddresses } from "@/components/Instance/IpAddressList";
import { FlavorInfo } from "@/components/Instance/FlavorInfo";
import { InstanceInfo } from "@/components/Instance/InstanceInfo";
import { Interfaces } from "@/components/Instance/Interfaces";
import { Suspense } from "react";
import { Loader } from "@/components/Loader";
import { getPortsByIdsWithNetworkName } from "@/lib/network";

interface Params {
  id: string;
}

export default async function Instance({ params }: { params: Params }) {
  const server: Server = await getInstance(params.id);
  const interfaceAttachments  = await getPortInterfaces(server.id.toString());
  const ports = interfaceAttachments.map((interfaceAttachment : InterfaceAttachment) => interfaceAttachment.port_id);
  const networkPorts = await getPortsByIdsWithNetworkName(ports);

  return (
    <><div key={server.id} className="font-bold text-l mt-4  pb-6"> {server.name} </div>
      <Tabs defaultValue="overview" className="max-w-screen-xl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="interfaces">Interfaces</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="max-w-screen-l">

          <div className="max-w-screen-xl mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-xl">
            <Suspense
              fallback={ <div className="p-20 flex justify-center items-center">
                            <Loader />
                          </div>} >
              <InstanceInfo server={server} />
              <FlavorInfo server={server} />
              <ServerIPAddresses server={server} />
              <SecurityGroupListByNames server={server} />
              <VolumeInfo server={server} />
            </Suspense>
          </div>
        </TabsContent>
        <TabsContent value="interfaces">
          <Interfaces networkPorts={networkPorts} />
        </TabsContent>
      </Tabs></>
  );
}

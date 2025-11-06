'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VolumeInfo from "@/components/Instance/VolumeInfo";
import SecurityGroupListByNames from "@/components/Instance/GroupList";
import { ServerIPAddresses } from "@/components/Instance/IpAddressList";
import { FlavorInfo } from "@/components/Instance/FlavorInfo";
import { InstanceInfo } from "@/components/Instance/InstanceInfo";
import { Interfaces } from "@/components/Instance/Interfaces";
import { Loader2 } from "lucide-react";
import { useServer, useServerInterfaces, usePort, useNetwork } from "@/hooks/queries";
import { useMemo } from "react";

interface Params {
  id: string;
}

export default function Instance({ params }: { params: Params }) {
  const { data: server, isLoading: isLoadingServer } = useServer(params.id);
  const { data: interfaceAttachments, isLoading: isLoadingInterfaces } = useServerInterfaces(params.id);

  const portIds = useMemo(() => {
    return interfaceAttachments?.map(attachment => attachment.port_id) || [];
  }, [interfaceAttachments]);

  // Call usePort for each port ID
  const portQueries = portIds.map(id => usePort(id));

  // Get ports data
  const ports = useMemo(() => {
    return portQueries.map(query => query.data).filter(Boolean);
  }, [portQueries.map(q => q.data).join()]);

  // Call useNetwork for each unique network ID
  const networkIds = useMemo(() => {
    return [...new Set(ports.map(port => port?.network_id).filter(Boolean))];
  }, [ports]);

  const networkQueries = networkIds.map(id => useNetwork(id!));

  // Enrich ports with network names
  const networkPorts = useMemo(() => {
    const networksMap = new Map();
    networkQueries.forEach(query => {
      if (query.data) {
        networksMap.set(query.data.id, query.data);
      }
    });

    return ports.map(port => {
      if (!port) return port;
      const network = networksMap.get(port.network_id);
      return {
        ...port,
        network_name: network?.name
      };
    });
  }, [ports, networkQueries.map(q => q.data).join()]);

  const isLoadingPorts = portQueries.some(q => q.isLoading) || networkQueries.some(q => q.isLoading);

  const isLoading = isLoadingServer || isLoadingInterfaces || isLoadingPorts;

  if (isLoading) {
    return (
      <div className="p-20 flex justify-center items-center">
        <Loader2 className="w-32 h-32 animate-spin" />
      </div>
    );
  }

  if (!server) {
    return <div>Server not found</div>;
  }

  return (
    <>
      <div key={server.id} className="font-bold text-l mt-4 pb-6"> {server.name} </div>
      <Tabs defaultValue="overview" className="max-w-screen-xl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="interfaces">Interfaces</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="max-w-screen-l">
          <div className="max-w-screen-xl mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-xl">
            <InstanceInfo server={server} />
            <FlavorInfo server={server} />
            <ServerIPAddresses server={server} />
            <SecurityGroupListByNames server={server} />
            <VolumeInfo server={server} />
          </div>
        </TabsContent>
        <TabsContent value="interfaces">
          <Interfaces networkPorts={networkPorts || []} />
        </TabsContent>
      </Tabs>
    </>
  );
}

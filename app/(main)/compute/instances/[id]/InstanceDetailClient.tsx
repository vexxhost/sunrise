'use client';

import { useSuspenseQuery, useSuspenseQueries } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VolumeInfo from "@/components/Instance/VolumeInfo";
import SecurityGroupListByNames from "@/components/Instance/GroupList";
import { ServerIPAddresses } from "@/components/Instance/IpAddressList";
import { FlavorInfo } from "@/components/Instance/FlavorInfo";
import { InstanceInfo } from "@/components/Instance/InstanceInfo";
import { Interfaces } from "@/components/Instance/Interfaces";
import { ActionLog } from "@/components/Instance/ActionLog";
import { Console } from "@/components/Instance/Console";
import { serverQueryOptions, serverInterfacesQueryOptions } from "@/hooks/queries/useServers";
import { portQueryOptions, networkQueryOptions } from "@/hooks/queries/useNetworks";
import { useMemo } from "react";

interface InstanceDetailClientProps {
  serverId: string;
  regionId?: string;
  projectId?: string;
}

export function InstanceDetailClient({ serverId, regionId, projectId }: InstanceDetailClientProps) {
  const { data: server } = useSuspenseQuery(
    serverQueryOptions(regionId, projectId, serverId)
  );
  const { data: interfaceAttachments } = useSuspenseQuery(
    serverInterfacesQueryOptions(regionId, projectId, serverId)
  );

  const portIds = useMemo(() => {
    return interfaceAttachments.map(attachment => attachment.port_id);
  }, [interfaceAttachments]);

  // Fetch all ports in parallel using useSuspenseQueries
  const portQueries = useSuspenseQueries({
    queries: portIds.map(id => portQueryOptions(regionId, projectId, id))
  });

  // Get ports data
  const ports = useMemo(() => {
    return portQueries.map(query => query.data);
  }, [portQueries]);

  // Get unique network IDs
  const networkIds = useMemo(() => {
    return Array.from(new Set(ports.map(port => port.network_id)));
  }, [ports]);

  // Fetch all networks in parallel using useSuspenseQueries
  const networkQueries = useSuspenseQueries({
    queries: networkIds.map(id => networkQueryOptions(regionId, projectId, id))
  });

  // Enrich ports with network names
  const networkPorts = useMemo(() => {
    const networksMap = new Map();
    networkQueries.forEach(query => {
      networksMap.set(query.data.id, query.data);
    });

    return ports.map(port => {
      const network = networksMap.get(port.network_id);
      return {
        ...port,
        network_name: network?.name
      };
    });
  }, [ports, networkQueries]);

  return (
    <>
      <div key={server.id} className="font-bold text-l mt-4 pb-6"> {server.name} </div>
      <Tabs defaultValue="overview" className="max-w-screen-xl">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="interfaces">Interfaces</TabsTrigger>
          <TabsTrigger value="action-log">Action Log</TabsTrigger>
          <TabsTrigger value="console">Console</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="max-w-screen-l">
          <div className="max-w-screen-xl mx-auto bg-card text-card-foreground rounded-xl shadow-md overflow-hidden md:max-xl">
            <InstanceInfo server={server} />
            <FlavorInfo server={server} />
            <ServerIPAddresses server={server} />
            <SecurityGroupListByNames server={server} regionId={regionId} projectId={projectId} />
            <VolumeInfo server={server} regionId={regionId} projectId={projectId} />
          </div>
        </TabsContent>
        <TabsContent value="interfaces">
          <Interfaces networkPorts={networkPorts || []} />
        </TabsContent>
        <TabsContent value="action-log" className="max-w-screen-l">
          <div className="max-w-screen-xl mx-auto bg-card text-card-foreground rounded-xl shadow-md overflow-hidden md:max-xl p-4">
            <ActionLog serverId={serverId} regionId={regionId} projectId={projectId} />
          </div>
        </TabsContent>
        <TabsContent value="console" className="max-w-screen-l">
          <div className="max-w-screen-xl mx-auto bg-card text-card-foreground rounded-xl shadow-md overflow-hidden md:max-xl p-4">
            <Console serverId={serverId} projectId={projectId} regionId={regionId} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

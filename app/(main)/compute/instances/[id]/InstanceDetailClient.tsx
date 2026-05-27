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
import { ConsoleLog } from "@/components/Instance/ConsoleLog";
import { serverQueryOptions, serverInterfacesQueryOptions } from "@/hooks/queries/useServers";
import { portQueryOptions, networkQueryOptions } from "@/hooks/queries/useNetworks";
import { useEffect, useMemo, useState } from "react";
import { isInstanceDetailTab, type InstanceDetailTab } from "./tabs";

interface InstanceDetailClientProps {
  serverId: string;
  regionId?: string;
  projectId?: string;
  activeTab: InstanceDetailTab;
}

const tabContentClass =
  "mt-4 rounded-md border bg-card p-4 text-card-foreground";

export function InstanceDetailClient({
  serverId,
  regionId,
  projectId,
  activeTab,
}: InstanceDetailClientProps) {
  const [selectedTab, setSelectedTab] = useState<InstanceDetailTab>(activeTab);
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

  useEffect(() => {
    setSelectedTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const segments = window.location.pathname.split("/").filter(Boolean);
      const tab = segments[segments.length - 1];

      if (tab && isInstanceDetailTab(tab)) {
        setSelectedTab(tab);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleTabChange = (value: string) => {
    if (!isInstanceDetailTab(value)) return;

    setSelectedTab(value);
    const nextPath = `/compute/instances/${serverId}/${value}`;

    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
  };

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">{server.id}</p>
      </div>
      <Tabs value={selectedTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="interfaces">Interfaces</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="action-log">Action Log</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className={tabContentClass}>
          <div className="space-y-6">
            <InstanceInfo server={server} />
            <FlavorInfo server={server} />
            <ServerIPAddresses server={server} />
            <SecurityGroupListByNames server={server} regionId={regionId} projectId={projectId} />
            <VolumeInfo server={server} regionId={regionId} projectId={projectId} />
          </div>
        </TabsContent>
        <TabsContent value="interfaces" className={tabContentClass}>
          <Interfaces networkPorts={networkPorts || []} />
        </TabsContent>
        <TabsContent value="log" className={tabContentClass}>
          <ConsoleLog serverId={serverId} regionId={regionId} projectId={projectId} />
        </TabsContent>
        <TabsContent value="console" className={tabContentClass}>
          <Console serverId={serverId} projectId={projectId} regionId={regionId} />
        </TabsContent>
        <TabsContent value="action-log" className={tabContentClass}>
          <ActionLog serverId={serverId} regionId={regionId} projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

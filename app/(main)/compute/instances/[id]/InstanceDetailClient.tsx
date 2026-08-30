'use client';

import { useSuspenseQuery, useSuspenseQueries } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InstanceOverview } from "@/components/Instance/InstanceOverview";
import { Interfaces } from "@/components/Instance/Interfaces";
import { ActionLog } from "@/components/Instance/ActionLog";
import { Console } from "@/components/Instance/Console";
import { ConsoleLog } from "@/components/Instance/ConsoleLog";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { InstanceDetailActions } from "@/components/Instance/InstanceDetailActions";
import { serverQueryOptions, serverInterfacesQueryOptions } from "@/hooks/queries/useServers";
import { portQueryOptions, networkQueryOptions } from "@/hooks/queries/useNetworks";
import { useEffect, useMemo, useState } from "react";
import { isInstanceDetailTab, type InstanceDetailTab } from "./tabs";
import { Badge } from "@/components/ui/badge";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import {
  formatServerActivity,
  formatServerPowerState,
  formatServerStatus,
  serverStatusBadgeVariant,
} from "@/lib/openstack/server-state";
import { isServerTransitioning } from "@/lib/openstack/server-lifecycle";

const TRANSITION_REFETCH_INTERVAL_MS = 5_000;

interface InstanceDetailClientProps {
  serverId: string;
  regionId?: string;
  projectId?: string;
  activeTab: InstanceDetailTab;
}

const tabContentClass = "mt-4";

export function InstanceDetailClient({
  serverId,
  regionId,
  projectId,
  activeTab,
}: InstanceDetailClientProps) {
  const [selectedTab, setSelectedTab] = useState<InstanceDetailTab>(activeTab);
  const { data: server } = useSuspenseQuery({
    ...serverQueryOptions(regionId, projectId, serverId),
    refetchInterval: (query) =>
      query.state.data && isServerTransitioning(query.state.data)
        ? TRANSITION_REFETCH_INTERVAL_MS
        : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
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

  const transitioning = isServerTransitioning(server);
  const taskState = server["OS-EXT-STS:task_state"];

  return (
    <div className="max-w-screen-xl space-y-4">
      <RecentResourceTracker
        kind="instance"
        id={String(server.id)}
        name={server.name || "Unnamed instance"}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{server.name}</h1>
            {transitioning ? (
              <ProgressStatusBadge
                className="text-sm"
                label={formatServerActivity(server.status, taskState)}
                title={`Nova status: ${formatServerStatus(server.status)}`}
              />
            ) : (
              <Badge variant={serverStatusBadgeVariant(server.status)}>
                {formatServerStatus(server.status)}
              </Badge>
            )}
            <Badge variant="secondary">
              {formatServerPowerState(server["OS-EXT-STS:power_state"])}
            </Badge>
            {transitioning && Number.isFinite(server.progress) && server.progress > 0 ? (
              <Badge variant="outline">
                {server.progress}%
              </Badge>
            ) : null}
          </div>
          <p className="truncate font-mono text-sm text-muted-foreground">{server.id}</p>
        </div>
        <InstanceDetailActions
          server={server}
          projectId={projectId}
          regionId={regionId}
        />
      </div>
      <Tabs value={selectedTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex w-full justify-start overflow-x-auto">
          <TabsTrigger className="min-w-28 flex-1 whitespace-nowrap" value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger className="min-w-28 flex-1 whitespace-nowrap" value="interfaces">
            Networking
          </TabsTrigger>
          <TabsTrigger className="min-w-28 flex-1 whitespace-nowrap" value="console">
            Console
          </TabsTrigger>
          <TabsTrigger className="min-w-28 flex-1 whitespace-nowrap" value="log">
            System log
          </TabsTrigger>
          <TabsTrigger className="min-w-28 flex-1 whitespace-nowrap" value="action-log">
            Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className={tabContentClass}>
          <InstanceOverview
            server={server}
            regionId={regionId}
            projectId={projectId}
          />
        </TabsContent>
        <TabsContent value="interfaces" className={`${tabContentClass} rounded-md border`}>
          <Interfaces networkPorts={networkPorts || []} />
        </TabsContent>
        <TabsContent value="log" className={`${tabContentClass} rounded-md border p-4`}>
          <ConsoleLog serverId={serverId} regionId={regionId} projectId={projectId} />
        </TabsContent>
        <TabsContent value="console" className={`${tabContentClass} rounded-md border p-4`}>
          <Console serverId={serverId} projectId={projectId} regionId={regionId} />
        </TabsContent>
        <TabsContent value="action-log" className={`${tabContentClass} rounded-md border p-4`}>
          <ActionLog serverId={serverId} regionId={regionId} projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

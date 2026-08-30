"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { EthernetPort } from "lucide-react";

import { PortDetailActions } from "@/components/Network/PortDetailActions";
import { Badge } from "@/components/ui/badge";
import {
  networkQueryOptions,
  portQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";

interface PortDetailClientProps {
  id: string;
  projectId: string;
  regionId: string;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

export function PortDetailClient({
  id,
  projectId,
  regionId,
}: PortDetailClientProps) {
  const port = useSuspenseQuery(portQueryOptions(regionId, projectId, id));
  const network = useSuspenseQuery(
    networkQueryOptions(regionId, projectId, port.data.network_id),
  );
  const groups = useSuspenseQuery(
    securityGroupsQueryOptions(regionId, projectId),
  );
  const servers = useSuspenseQuery(serversQueryOptions(regionId, projectId));
  const groupById = useMemo(
    () => new Map(groups.data.map((group) => [group.id, group])),
    [groups.data],
  );
  const server = servers.data.find(
    (candidate) => candidate.id === port.data.device_id,
  );
  const owned =
    port.data.project_id === projectId || port.data.tenant_id === projectId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <EthernetPort className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {port.data.name || port.data.id}
            </h2>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {port.data.id}
          </p>
        </div>
        {owned ? (
          <PortDetailActions
            port={port.data}
            groups={groups.data}
            servers={servers.data}
            projectId={projectId}
            regionId={regionId}
          />
        ) : (
          <Badge variant="outline">Read-only context</Badge>
        )}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Port details</h3>
        <div className="divide-y rounded-md border">
          <DetailRow label="Status" value={port.data.status} />
          <DetailRow
            label="Network"
            value={network.data.name || network.data.id}
          />
          <DetailRow label="MAC address" value={port.data.mac_address} />
          <DetailRow
            label="Attachment"
            value={
              server ? (
                <Link
                  className="font-medium hover:underline"
                  href={`/compute/instances/${server.id}/interfaces`}
                >
                  {server.name || server.id}
                </Link>
              ) : port.data.device_owner ? (
                port.data.device_owner
              ) : (
                "Unattached"
              )
            }
          />
          <DetailRow label="Device ID" value={port.data.device_id || "None"} />
          <DetailRow
            label="Admin state"
            value={port.data.admin_state_up ? "Up" : "Down"}
          />
          <DetailRow
            label="Port security"
            value={port.data.port_security_enabled ? "Enabled" : "Disabled"}
          />
          <DetailRow
            label="vNIC type"
            value={port.data["binding:vnic_type"] || "Normal"}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Fixed addresses</h3>
          <div className="divide-y rounded-md border">
            {port.data.fixed_ips.length ? (
              port.data.fixed_ips.map((fixedIp) => (
                <div
                  key={`${fixedIp.subnet_id}-${fixedIp.ip_address}`}
                  className="px-3 py-2.5"
                >
                  <p className="font-mono text-sm">{fixedIp.ip_address}</p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {fixedIp.subnet_id}
                  </p>
                </div>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No fixed addresses assigned.
              </p>
            )}
          </div>
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Security groups</h3>
          <div className="divide-y rounded-md border">
            {port.data.security_groups.length ? (
              port.data.security_groups.map((groupId) => (
                <div key={groupId} className="px-3 py-2.5 text-sm">
                  {groupById.get(groupId)?.name || groupId}
                </div>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No security groups applied.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

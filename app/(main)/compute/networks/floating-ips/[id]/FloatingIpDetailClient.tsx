"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Globe2 } from "lucide-react";
import { FloatingIpDetailActions } from "@/components/Network/FloatingIpDetailActions";
import { Badge } from "@/components/ui/badge";
import {
  floatingIpQueryOptions,
  portsQueryOptions,
} from "@/hooks/queries/useNetworks";

export function FloatingIpDetailClient({
  id,
  projectId,
  regionId,
}: {
  id: string;
  projectId: string;
  regionId: string;
}) {
  const floatingIp = useSuspenseQuery(
    floatingIpQueryOptions(regionId, projectId, id),
  );
  const ports = useSuspenseQuery(portsQueryOptions(regionId, projectId));
  const associatedPort = ports.data.find(
    (port) => port.id === floatingIp.data.port_id,
  );
  const owned =
    floatingIp.data.project_id === projectId ||
    floatingIp.data.tenant_id === projectId;
  const rows = [
    ["ID", floatingIp.data.id],
    ["Status", floatingIp.data.status],
    ["Description", floatingIp.data.description || "None"],
    ["Fixed IP", floatingIp.data.fixed_ip_address || "Not associated"],
    ["Port", associatedPort?.name || associatedPort?.id || "None"],
    ["Router ID", floatingIp.data.router_id || "None"],
    ["External network ID", floatingIp.data.floating_network_id],
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="size-5 text-muted-foreground" />
            <h2 className="font-mono text-xl font-semibold">
              {floatingIp.data.floating_ip_address}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Floating IP</p>
        </div>
        {owned ? (
          <FloatingIpDetailActions
            floatingIp={floatingIp.data}
            ports={ports.data}
            projectId={projectId}
            regionId={regionId}
          />
        ) : (
          <Badge variant="outline">Read-only context</Badge>
        )}
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Address details</h3>
        <div className="divide-y rounded-md border">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="min-w-0 break-words">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

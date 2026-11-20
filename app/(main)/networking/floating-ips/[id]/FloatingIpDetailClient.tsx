"use client";
import type { ReactNode } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Globe2 } from "lucide-react";
import { FloatingIpDetailActions } from "@/components/Network/FloatingIpDetailActions";
import { FloatingIpPortForwardingSection } from "@/components/Network/FloatingIpPortForwardingSection";
import { NeutronResourceTagsSection } from "@/components/Network/NeutronResourceTagsSection";
import { qosPolicyLabel } from "@/components/Network/QosPolicySelect";
import { Badge } from "@/components/ui/badge";
import {
  floatingIpQueryOptions,
  floatingIpPortForwardingsQueryOptions,
  portsQueryOptions,
  qosPoliciesQueryOptions,
} from "@/hooks/queries/useNetworks";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";

export function FloatingIpDetailClient({
  dnsIntegrationSupport,
  id,
  projectId,
  qosNetworkPolicySupport,
  qosSupport,
  tagSupport,
  portForwardingDescriptionSupport,
  portForwardingRangeSupport,
  portForwardingSupport,
  regionId,
}: {
  dnsIntegrationSupport: OpenStackFeatureSupport;
  id: string;
  projectId: string;
  qosNetworkPolicySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  tagSupport: OpenStackFeatureSupport;
  portForwardingDescriptionSupport: OpenStackFeatureSupport;
  portForwardingRangeSupport: OpenStackFeatureSupport;
  portForwardingSupport: OpenStackFeatureSupport;
  regionId: string;
}) {
  const floatingIp = useSuspenseQuery(
    floatingIpQueryOptions(regionId, projectId, id),
  );
  const ports = useSuspenseQuery(portsQueryOptions(regionId, projectId));
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled:
      qosSupport.status !== "unsupported" ||
      qosNetworkPolicySupport.status !== "unsupported" ||
      Boolean(floatingIp.data.qos_policy_id) ||
      Boolean(floatingIp.data.qos_network_policy_id),
  });
  const associatedPort = ports.data.find(
    (port) => port.id === floatingIp.data.port_id,
  );
  const owned =
    floatingIp.data.project_id === projectId ||
    floatingIp.data.tenant_id === projectId;
  const portForwardings = useQuery({
    ...floatingIpPortForwardingsQueryOptions(regionId, projectId, id),
    enabled: owned && portForwardingSupport.status !== "unsupported",
  });
  const rows: Array<[string, ReactNode]> = [
    ["ID", floatingIp.data.id],
    ["Status", floatingIp.data.status],
    ["Description", floatingIp.data.description || "None"],
    ...(qosSupport.status !== "unsupported" || floatingIp.data.qos_policy_id
      ? ([
          [
            "Direct QoS policy",
            qosPolicyLabel(
              qosPolicies.data ?? [],
              floatingIp.data.qos_policy_id,
            ),
          ],
        ] as Array<[string, ReactNode]>)
      : []),
    ...(qosNetworkPolicySupport.status !== "unsupported" ||
    floatingIp.data.qos_network_policy_id
      ? ([
          [
            "Network QoS policy",
            qosPolicyLabel(
              qosPolicies.data ?? [],
              floatingIp.data.qos_network_policy_id,
            ),
          ],
        ] as Array<[string, ReactNode]>)
      : []),
    ...(dnsIntegrationSupport.status !== "unsupported" ||
    floatingIp.data.dns_name ||
    floatingIp.data.dns_domain
      ? ([
          ["DNS name", floatingIp.data.dns_name || "None"],
          ["DNS domain", floatingIp.data.dns_domain || "None"],
        ] as Array<[string, ReactNode]>)
      : []),
    ["Fixed IP", floatingIp.data.fixed_ip_address || "Not associated"],
    [
      "Port",
      associatedPort ? (
        <ResourceLink
          href={`/networking/ports/${encodeURIComponent(associatedPort.id)}`}
        >
          {associatedPort.name || associatedPort.id}
        </ResourceLink>
      ) : (
        "None"
      ),
    ],
    [
      "Port ID",
      floatingIp.data.port_id ? (
        <ResourceLink
          href={`/networking/ports/${encodeURIComponent(floatingIp.data.port_id)}`}
          className="font-mono text-xs"
        >
          {floatingIp.data.port_id}
        </ResourceLink>
      ) : (
        "None"
      ),
    ],
    [
      "Router ID",
      floatingIp.data.router_id ? (
        <ResourceLink
          href={`/networking/routers/${encodeURIComponent(floatingIp.data.router_id)}`}
          className="font-mono text-xs"
        >
          {floatingIp.data.router_id}
        </ResourceLink>
      ) : (
        "None"
      ),
    ],
    [
      "External network ID",
      <ResourceLink
        key="external-network"
        href={`/networking/networks/${encodeURIComponent(floatingIp.data.floating_network_id)}`}
        className="font-mono text-xs"
      >
        {floatingIp.data.floating_network_id}
      </ResourceLink>,
    ],
  ];
  return (
    <div className="space-y-6">
      <RecentResourceTracker
        kind="floating-ip"
        id={floatingIp.data.id}
        name={floatingIp.data.floating_ip_address}
      />
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
            portForwardingCount={
              portForwardingSupport.status === "unsupported"
                ? 0
                : (portForwardings.data?.length ?? null)
            }
            qosSupport={qosSupport}
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
      <NeutronResourceTagsSection
        owned={owned}
        projectId={projectId}
        regionId={regionId}
        resource={floatingIp.data}
        resourceType="floating-ip"
        support={tagSupport}
      />
      <FloatingIpPortForwardingSection
        baseSupport={portForwardingSupport}
        descriptionSupport={portForwardingDescriptionSupport}
        floatingIp={floatingIp.data}
        owned={owned}
        ports={ports.data}
        projectId={projectId}
        rangeSupport={portForwardingRangeSupport}
        regionId={regionId}
      />
    </div>
  );
}

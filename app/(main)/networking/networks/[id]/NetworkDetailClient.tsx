"use client";

import { Fragment, useMemo } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { GitBranch, Network as NetworkIcon } from "lucide-react";

import { NetworkDetailActions } from "@/components/Network/NetworkDetailActions";
import { NetworkIpAvailabilitySection } from "@/components/Network/NetworkIpAvailabilitySection";
import { NeutronResourceTagsSection } from "@/components/Network/NeutronResourceTagsSection";
import { qosPolicyLabel } from "@/components/Network/QosPolicySelect";
import { SubnetDetailActions } from "@/components/Network/SubnetDetailActions";
import { Badge } from "@/components/ui/badge";
import {
  networkQueryOptions,
  networkIpAvailabilityQueryOptions,
  networkSubnetsQueryOptions,
  portsQueryOptions,
  qosPoliciesQueryOptions,
  routersQueryOptions,
} from "@/hooks/queries/useNetworks";
import { isRouterInterfacePort } from "@/lib/openstack/neutron-topology";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";

interface NetworkDetailClientProps {
  availabilityZoneSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  id: string;
  mtuSupport: OpenStackFeatureSupport;
  ipAvailabilitySupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  tagSupport: OpenStackFeatureSupport;
  projectId: string;
  regionId: string;
  subnetDnsPublishSupport: OpenStackFeatureSupport;
  vlanTransparencySupport: OpenStackFeatureSupport;
}

function DetailGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="divide-y rounded-md border">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="min-w-0 break-words">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function NetworkDetailClient({
  availabilityZoneSupport,
  dnsIntegrationSupport,
  id,
  ipAvailabilitySupport,
  mtuSupport,
  portSecuritySupport,
  qosSupport,
  tagSupport,
  projectId,
  regionId,
  subnetDnsPublishSupport,
  vlanTransparencySupport,
}: NetworkDetailClientProps) {
  const network = useSuspenseQuery(
    networkQueryOptions(regionId, projectId, id),
  );
  const subnets = useSuspenseQuery(
    networkSubnetsQueryOptions(regionId, projectId, id),
  );
  const ipAvailability = useQuery({
    ...networkIpAvailabilityQueryOptions(regionId, projectId, id),
    enabled: ipAvailabilitySupport.status !== "unsupported",
  });
  const routers = useSuspenseQuery(routersQueryOptions(regionId, projectId));
  const ports = useSuspenseQuery(portsQueryOptions(regionId, projectId));
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled:
      qosSupport.status !== "unsupported" ||
      Boolean(network.data.qos_policy_id),
  });
  const routerInterfaces = useMemo(
    () => ports.data.filter(isRouterInterfacePort),
    [ports.data],
  );
  const routerById = useMemo(
    () => new Map(routers.data.map((router) => [router.id, router])),
    [routers.data],
  );
  const owned =
    network.data.project_id === projectId ||
    network.data.tenant_id === projectId;
  const showSubnetDnsPublication =
    subnetDnsPublishSupport.status !== "unsupported" ||
    subnets.data.some((subnet) => subnet.dns_publish_fixed_ip !== undefined);
  const networkRows = useMemo<Array<[string, React.ReactNode]>>(
    () => [
      ["ID", network.data.id],
      [
        "Status",
        <Badge
          key="status"
          variant={network.data.status === "ACTIVE" ? "secondary" : "outline"}
        >
          {network.data.status}
        </Badge>,
      ],
      ["Description", network.data.description || "None"],
      ["Admin state", network.data.admin_state_up ? "Up" : "Down"],
      ["MTU", network.data.mtu],
      ...(vlanTransparencySupport.status === "unsupported" &&
      network.data.vlan_transparent == null
        ? []
        : ([
            [
              "VLAN transparent",
              network.data.vlan_transparent == null
                ? "Not reported"
                : network.data.vlan_transparent
                  ? "Enabled"
                  : "Disabled",
            ],
          ] as Array<[string, React.ReactNode]>)),
      ...(dnsIntegrationSupport.status !== "unsupported" ||
      network.data.dns_domain
        ? ([["DNS domain", network.data.dns_domain || "None"]] as Array<
            [string, React.ReactNode]
          >)
        : []),
      ...(portSecuritySupport.status === "unsupported"
        ? []
        : ([
            [
              "Port security",
              network.data.port_security_enabled ? "Enabled" : "Disabled",
            ],
          ] as Array<[string, React.ReactNode]>)),
      ...(qosSupport.status === "unsupported" && !network.data.qos_policy_id
        ? []
        : ([
            [
              "QoS policy",
              qosPolicyLabel(
                qosPolicies.data ?? [],
                network.data.qos_policy_id,
              ),
            ],
          ] as Array<[string, React.ReactNode]>)),
      ["Shared", network.data.shared ? "Yes" : "No"],
      ["External", network.data["router:external"] ? "Yes" : "No"],
      ...(availabilityZoneSupport.status === "unsupported"
        ? []
        : ([
            [
              "Availability zone hints",
              network.data.availability_zone_hints?.join(", ") ||
                "Cloud scheduler",
            ],
            [
              "Availability zones",
              network.data.availability_zones?.join(", ") || "None reported",
            ],
          ] as Array<[string, React.ReactNode]>)),
    ],
    [
      availabilityZoneSupport.status,
      dnsIntegrationSupport.status,
      network.data,
      portSecuritySupport.status,
      qosPolicies.data,
      qosSupport.status,
      vlanTransparencySupport.status,
    ],
  );

  return (
    <div className="space-y-6">
      <RecentResourceTracker
        kind="network"
        id={network.data.id}
        name={network.data.name || network.data.id}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <NetworkIcon className="size-5 text-muted-foreground" />
            <h2 className="break-words text-xl font-semibold">
              {network.data.name || network.data.id}
            </h2>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {network.data.id}
          </p>
        </div>
        {owned ? (
          <NetworkDetailActions
            dnsIntegrationSupport={dnsIntegrationSupport}
            mtuSupport={mtuSupport}
            network={network.data}
            portSecuritySupport={portSecuritySupport}
            qosSupport={qosSupport}
            projectId={projectId}
            regionId={regionId}
            subnetDnsPublishSupport={subnetDnsPublishSupport}
          />
        ) : (
          <Badge variant="outline">Read-only context</Badge>
        )}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Network details</h3>
        <DetailGrid rows={networkRows} />
      </section>
      <NeutronResourceTagsSection
        owned={owned}
        projectId={projectId}
        regionId={regionId}
        resource={network.data}
        resourceType="network"
        support={tagSupport}
      />
      {ipAvailabilitySupport.status !== "unsupported" ? (
        ipAvailability.isPending ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">IP capacity</h3>
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Loading IP availability…
            </div>
          </section>
        ) : ipAvailability.isError ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">IP capacity</h3>
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              IP availability could not be loaded.
            </div>
          </section>
        ) : (
          <NetworkIpAvailabilitySection
            result={ipAvailability.data}
            support={ipAvailabilitySupport}
          />
        )
      ) : null}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Subnets</h3>
          <Badge variant="outline">{subnets.data.length}</Badge>
        </div>
        {subnets.data.length ? (
          <div className="overflow-x-auto rounded-md border">
            <div
              className={
                showSubnetDnsPublication
                  ? "grid min-w-[84rem] grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_8rem_6rem] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground"
                  : "grid min-w-[76rem] grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_6rem] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground"
              }
            >
              <span>Name</span>
              <span>CIDR</span>
              <span>Allocation pools</span>
              <span>DNS servers</span>
              <span>Router</span>
              <span>DHCP</span>
              {showSubnetDnsPublication ? <span>External DNS</span> : null}
              <span className="text-right">Actions</span>
            </div>
            {subnets.data.map((subnet) => {
              const connectedRouters = routerInterfaces
                .filter((port) =>
                  port.fixed_ips.some(
                    (fixedIp) => fixedIp.subnet_id === subnet.id,
                  ),
                )
                .map((port) => routerById.get(port.device_id))
                .filter((router) => router !== undefined);
              return (
                <div
                  key={subnet.id}
                  className={
                    showSubnetDnsPublication
                      ? "grid min-w-[84rem] grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_8rem_6rem] items-center px-3 py-2 text-sm not-last:border-b"
                      : "grid min-w-[76rem] grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_6rem] items-center px-3 py-2 text-sm not-last:border-b"
                  }
                >
                  <span className="truncate" title={subnet.name || subnet.id}>
                    {subnet.name || subnet.id}
                  </span>
                  <span className="font-mono text-xs">{subnet.cidr}</span>
                  <span className="truncate font-mono text-xs">
                    {subnet.allocation_pools.length
                      ? subnet.allocation_pools
                          .map((pool) => `${pool.start}–${pool.end}`)
                          .join(", ")
                      : "None"}
                  </span>
                  <span className="truncate font-mono text-xs">
                    {subnet.dns_nameservers.join(", ") || "Default"}
                  </span>
                  <span className="truncate">
                    {connectedRouters.length
                      ? connectedRouters.map((router, index) => (
                          <Fragment key={router.id}>
                            {index > 0 ? ", " : null}
                            <ResourceLink
                              href={`/networking/routers/${encodeURIComponent(router.id)}`}
                            >
                              {router.name || router.id}
                            </ResourceLink>
                          </Fragment>
                        ))
                      : "Not attached"}
                  </span>
                  <span>{subnet.enable_dhcp ? "Enabled" : "Disabled"}</span>
                  {showSubnetDnsPublication ? (
                    <span>
                      {subnet.dns_publish_fixed_ip === undefined
                        ? "Not reported"
                        : subnet.dns_publish_fixed_ip
                          ? "Published"
                          : "Not published"}
                    </span>
                  ) : null}
                  <div className="flex justify-end">
                    <SubnetDetailActions
                      projectId={projectId}
                      regionId={regionId}
                      routerInterfaces={routerInterfaces}
                      routers={routers.data}
                      subnet={subnet}
                      subnetDnsPublishSupport={subnetDnsPublishSupport}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No address space has been defined for this network.
          </div>
        )}
      </section>
    </div>
  );
}

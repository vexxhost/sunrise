"use client";

import { useMemo } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { EthernetPort } from "lucide-react";

import { PortDetailActions } from "@/components/Network/PortDetailActions";
import { NeutronResourceTagsSection } from "@/components/Network/NeutronResourceTagsSection";
import { qosPolicyLabel } from "@/components/Network/QosPolicySelect";
import { Badge } from "@/components/ui/badge";
import {
  networkQueryOptions,
  portQueryOptions,
  qosPoliciesQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import { neutronPortVnicTypeLabel } from "@/lib/openstack/neutron-port-vnic-types";
import {
  neutronPortHardwareOffloadTypeLabel,
  neutronPortNumaAffinityPolicyLabel,
} from "@/lib/openstack/neutron-port-placement";
import {
  inspectNeutronPortResourceRequest,
  neutronPortIpAllocationLabel,
} from "@/lib/openstack/neutron-port-resource-requests";

interface PortDetailClientProps {
  allowedAddressPairsSupport: OpenStackFeatureSupport;
  dnsDomainPortsSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  extraDhcpOptionsSupport: OpenStackFeatureSupport;
  hardwareOffloadSupport: OpenStackFeatureSupport;
  id: string;
  ipAllocationSupport: OpenStackFeatureSupport;
  numaAffinitySupport: OpenStackFeatureSupport;
  numaSocketSupport: OpenStackFeatureSupport;
  portBindingSupport: OpenStackFeatureSupport;
  portMacAddressRegenerationSupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosNetworkPolicySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  projectId: string;
  regionId: string;
  rejectMulticastAddressPairs: boolean;
  resourceRequestSupport: OpenStackFeatureSupport;
  securityGroupSupport: OpenStackFeatureSupport;
  tagSupport: OpenStackFeatureSupport;
  trustedVifSupport: OpenStackFeatureSupport;
  uplinkStatusPropagationSupport: OpenStackFeatureSupport;
  uplinkStatusPropagationUpdateSupport: OpenStackFeatureSupport;
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
  allowedAddressPairsSupport,
  dnsDomainPortsSupport,
  dnsIntegrationSupport,
  extraDhcpOptionsSupport,
  hardwareOffloadSupport,
  id,
  ipAllocationSupport,
  numaAffinitySupport,
  numaSocketSupport,
  portBindingSupport,
  portMacAddressRegenerationSupport,
  portSecuritySupport,
  projectId,
  qosNetworkPolicySupport,
  qosSupport,
  regionId,
  rejectMulticastAddressPairs,
  resourceRequestSupport,
  securityGroupSupport,
  tagSupport,
  trustedVifSupport,
  uplinkStatusPropagationSupport,
  uplinkStatusPropagationUpdateSupport,
}: PortDetailClientProps) {
  const port = useSuspenseQuery(portQueryOptions(regionId, projectId, id));
  const network = useSuspenseQuery(
    networkQueryOptions(regionId, projectId, port.data.network_id),
  );
  const groups = useQuery({
    ...securityGroupsQueryOptions(regionId, projectId),
    enabled: securityGroupSupport.status !== "unsupported",
  });
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled:
      qosSupport.status !== "unsupported" ||
      qosNetworkPolicySupport.status !== "unsupported" ||
      Boolean(port.data.qos_policy_id) ||
      Boolean(port.data.qos_network_policy_id),
  });
  const servers = useSuspenseQuery(serversQueryOptions(regionId, projectId));
  const groupById = useMemo(
    () => new Map((groups.data ?? []).map((group) => [group.id, group])),
    [groups.data],
  );
  const server = servers.data.find(
    (candidate) => candidate.id === port.data.device_id,
  );
  const routerOwned =
    port.data.device_owner.startsWith("network:router") &&
    Boolean(port.data.device_id);
  const attachmentHref = server
    ? `/compute/instances/${encodeURIComponent(server.id)}/interfaces`
    : routerOwned
      ? `/networking/routers/${encodeURIComponent(port.data.device_id)}`
      : undefined;
  const attachmentLabel = server
    ? server.name || server.id
    : routerOwned
      ? "Router"
      : port.data.device_owner || "Unattached";
  const owned =
    port.data.project_id === projectId || port.data.tenant_id === projectId;
  const portDisplayName =
    port.data.name ||
    port.data.fixed_ips[0]?.ip_address ||
    port.data.mac_address ||
    port.data.id;
  const { reported: resourceRequestReported, request: placementRequest } =
    inspectNeutronPortResourceRequest(port.data);

  return (
    <div className="space-y-6">
      <RecentResourceTracker
        kind="port"
        id={port.data.id}
        name={portDisplayName}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <EthernetPort className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{portDisplayName}</h2>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {port.data.id}
          </p>
        </div>
        {owned ? (
          <PortDetailActions
            allowedAddressPairsSupport={allowedAddressPairsSupport}
            dnsDomainPortsSupport={dnsDomainPortsSupport}
            dnsIntegrationSupport={dnsIntegrationSupport}
            extraDhcpOptionsSupport={extraDhcpOptionsSupport}
            numaAffinitySupport={numaAffinitySupport}
            numaSocketSupport={numaSocketSupport}
            port={port.data}
            portBindingSupport={portBindingSupport}
            portMacAddressRegenerationSupport={
              portMacAddressRegenerationSupport
            }
            portSecuritySupport={portSecuritySupport}
            qosSupport={qosSupport}
            groups={groups.data ?? []}
            servers={servers.data}
            projectId={projectId}
            regionId={regionId}
            rejectMulticastAddressPairs={rejectMulticastAddressPairs}
            securityGroupSupport={securityGroupSupport}
            trustedVifSupport={trustedVifSupport}
            uplinkStatusPropagationSupport={uplinkStatusPropagationSupport}
            uplinkStatusPropagationUpdateSupport={
              uplinkStatusPropagationUpdateSupport
            }
          />
        ) : (
          <Badge variant="outline">Read-only context</Badge>
        )}
      </div>

      <NeutronResourceTagsSection
        owned={owned}
        projectId={projectId}
        regionId={regionId}
        resource={port.data}
        resourceType="port"
        support={tagSupport}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Port details</h3>
        <div className="divide-y rounded-md border">
          <DetailRow label="Status" value={port.data.status} />
          <DetailRow
            label="Network"
            value={
              <ResourceLink
                href={`/networking/networks/${encodeURIComponent(network.data.id)}`}
              >
                {network.data.name || network.data.id}
              </ResourceLink>
            }
          />
          {qosSupport.status !== "unsupported" || port.data.qos_policy_id ? (
            <DetailRow
              label="Direct QoS policy"
              value={qosPolicyLabel(
                qosPolicies.data ?? [],
                port.data.qos_policy_id,
              )}
            />
          ) : null}
          {qosNetworkPolicySupport.status !== "unsupported" ||
          port.data.qos_network_policy_id ? (
            <DetailRow
              label="Network QoS policy"
              value={qosPolicyLabel(
                qosPolicies.data ?? [],
                port.data.qos_network_policy_id,
              )}
            />
          ) : null}
          <DetailRow label="MAC address" value={port.data.mac_address} />
          {ipAllocationSupport.status !== "unsupported" ||
          port.data.ip_allocation ? (
            <DetailRow
              label="IP allocation"
              value={neutronPortIpAllocationLabel(port.data.ip_allocation)}
            />
          ) : null}
          {dnsIntegrationSupport.status !== "unsupported" ||
          port.data.dns_name ? (
            <DetailRow label="DNS name" value={port.data.dns_name || "None"} />
          ) : null}
          {dnsDomainPortsSupport.status !== "unsupported" ||
          port.data.dns_domain ? (
            <DetailRow
              label="DNS domain"
              value={port.data.dns_domain || "None"}
            />
          ) : null}
          <DetailRow
            label="Attachment"
            value={
              attachmentHref ? (
                <ResourceLink href={attachmentHref}>
                  {attachmentLabel}
                </ResourceLink>
              ) : (
                attachmentLabel
              )
            }
          />
          <DetailRow
            label="Device ID"
            value={
              attachmentHref ? (
                <ResourceLink
                  href={attachmentHref}
                  className="font-mono text-xs"
                >
                  {port.data.device_id}
                </ResourceLink>
              ) : (
                port.data.device_id || "None"
              )
            }
          />
          <DetailRow
            label="Admin state"
            value={port.data.admin_state_up ? "Up" : "Down"}
          />
          {uplinkStatusPropagationSupport.status !== "unsupported" ||
          port.data.propagate_uplink_status !== undefined ? (
            <DetailRow
              label="Uplink status propagation"
              value={
                port.data.propagate_uplink_status === undefined
                  ? "Not reported"
                  : port.data.propagate_uplink_status
                    ? "Enabled"
                    : "Disabled"
              }
            />
          ) : null}
          {portSecuritySupport.status !== "unsupported" ? (
            <DetailRow
              label="Port security"
              value={port.data.port_security_enabled ? "Enabled" : "Disabled"}
            />
          ) : null}
          <DetailRow
            label="vNIC type"
            value={neutronPortVnicTypeLabel(port.data["binding:vnic_type"])}
          />
          {numaAffinitySupport.status !== "unsupported" ||
          port.data.numa_affinity_policy != null ? (
            <DetailRow
              label="NUMA affinity"
              value={neutronPortNumaAffinityPolicyLabel(
                port.data.numa_affinity_policy,
              )}
            />
          ) : null}
          {hardwareOffloadSupport.status !== "unsupported" ||
          port.data.hardware_offload_type ? (
            <DetailRow
              label="Hardware offload"
              value={neutronPortHardwareOffloadTypeLabel(
                port.data.hardware_offload_type,
              )}
            />
          ) : null}
          {trustedVifSupport.status !== "unsupported" ||
          port.data.trusted != null ? (
            <DetailRow
              label="Trusted VIF"
              value={
                port.data.trusted == null
                  ? "Not reported"
                  : port.data.trusted
                    ? "Trusted"
                    : "Not trusted"
              }
            />
          ) : null}
        </div>
      </section>

      {dnsIntegrationSupport.status !== "unsupported" ||
      port.data.dns_assignment?.length ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">DNS assignments</h3>
          <div className="divide-y rounded-md border">
            {port.data.dns_assignment?.length ? (
              port.data.dns_assignment.map((assignment) => (
                <div
                  key={`${assignment.ip_address}-${assignment.fqdn}`}
                  className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-3"
                >
                  <span className="font-mono">{assignment.ip_address}</span>
                  <span>{assignment.hostname}</span>
                  <span className="break-all text-muted-foreground">
                    {assignment.fqdn}
                  </span>
                </div>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No DNS assignments reported.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {resourceRequestSupport.status !== "unsupported" ||
      port.data.resource_request ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Placement requirements</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Resources and traits Neutron asks Nova to place with this port.
            </p>
          </div>
          <div className="divide-y rounded-md border">
            {placementRequest ? (
              <>
                {placementRequest.groups.map((group, index) => (
                  <div key={group.id ?? index} className="space-y-3 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        Request group {index + 1}
                      </p>
                      {group.id ? (
                        <span className="break-all font-mono text-xs text-muted-foreground">
                          {group.id}
                        </span>
                      ) : null}
                    </div>
                    {group.resources.length ? (
                      <dl className="grid gap-2 text-sm">
                        {group.resources.map((resource) => (
                          <div
                            key={resource.resourceClass}
                            className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto]"
                          >
                            <dt className="break-all font-mono text-xs text-muted-foreground">
                              {resource.resourceClass}
                            </dt>
                            <dd>{resource.amount.toLocaleString()}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {group.required.length ? (
                      <div className="flex flex-wrap gap-2">
                        {group.required.map((trait) => (
                          <Badge
                            key={trait}
                            variant="outline"
                            className="max-w-full break-all font-mono text-xs"
                          >
                            {trait}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {placementRequest.sameSubtree.length ? (
                  <div className="space-y-2 px-3 py-3 text-sm">
                    <p className="font-medium">
                      Same resource-provider subtree
                    </p>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {placementRequest.sameSubtree.join(", ")}
                    </p>
                  </div>
                ) : null}
              </>
            ) : resourceRequestReported ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No Placement resources requested.
              </p>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Placement requirements were not returned. Cloud policy may
                restrict access to this field.
              </p>
            )}
          </div>
        </section>
      ) : null}

      <div
        className={
          securityGroupSupport.status === "unsupported" &&
          allowedAddressPairsSupport.status === "unsupported"
            ? "grid gap-6"
            : "grid gap-6 lg:grid-cols-2"
        }
      >
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
        {securityGroupSupport.status !== "unsupported" ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Security groups</h3>
            <div className="divide-y rounded-md border">
              {port.data.security_groups.length ? (
                port.data.security_groups.map((groupId) => (
                  <div key={groupId} className="px-3 py-2.5 text-sm">
                    <ResourceLink
                      href={`/networking/security-groups/${encodeURIComponent(groupId)}`}
                    >
                      {groupById.get(groupId)?.name || groupId}
                    </ResourceLink>
                  </div>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No security groups applied.
                </p>
              )}
            </div>
          </section>
        ) : null}
        {allowedAddressPairsSupport.status !== "unsupported" ||
        port.data.allowed_address_pairs?.length ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Allowed address pairs</h3>
            <div className="divide-y rounded-md border">
              {port.data.allowed_address_pairs?.length ? (
                port.data.allowed_address_pairs.map((pair) => (
                  <div
                    key={`${pair.ip_address}-${pair.mac_address}`}
                    className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-2"
                  >
                    <span className="font-mono">{pair.ip_address}</span>
                    <span className="font-mono text-muted-foreground">
                      {pair.mac_address || port.data.mac_address}
                    </span>
                  </div>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No additional address pairs allowed.
                </p>
              )}
            </div>
          </section>
        ) : null}
        {extraDhcpOptionsSupport.status !== "unsupported" ||
        port.data.extra_dhcp_opts?.length ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Extra DHCP options</h3>
            <div className="divide-y rounded-md border">
              {port.data.extra_dhcp_opts?.length ? (
                port.data.extra_dhcp_opts.map((option) => (
                  <div
                    key={`${option.ip_version ?? 4}-${option.opt_name}`}
                    className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <span className="text-muted-foreground">
                      IPv{option.ip_version ?? 4}
                    </span>
                    <span className="font-mono text-xs">{option.opt_name}</span>
                    <span className="break-words font-mono text-xs text-muted-foreground">
                      {option.opt_value || "Empty value"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No extra DHCP options configured.
                </p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

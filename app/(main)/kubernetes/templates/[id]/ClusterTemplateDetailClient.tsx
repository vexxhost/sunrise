"use client";

import Link from "next/link";
import { useMemo, useState, type ComponentType } from "react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Boxes, Cloud, Eye, Gauge, Pencil } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ClusterTemplateMutationSheet } from "@/components/Kubernetes/ClusterTemplateMutationSheet";
import { DriverConfigurationTable } from "@/components/Kubernetes/DriverConfigurationTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { clusterTemplateQueryOptions } from "@/hooks/queries/useMagnum";
import {
  networksQueryOptions,
  visibleSubnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { flavorsQueryOptions } from "@/hooks/queries/useServers";
import {
  magnumImageDistribution,
  normalizeKubernetesVersion,
} from "@/lib/openstack/magnum-domain";
import { MAGNUM_DRIVER_LABEL_KEYS } from "@/lib/openstack/magnum-labels";

interface ClusterTemplateDetailClientProps {
  projectId?: string;
  regionId?: string;
  templateId: string;
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Enabled" : "Disabled";
}

function labelBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function SummaryTile({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: React.ReactNode;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 min-w-0 truncate text-base font-semibold">
        {value}
      </div>
      <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground">
        {detail}
      </div>
    </div>
  );
}

function ResourceLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href?: string;
}) {
  return href ? (
    <Link
      className="underline-offset-2 hover:underline focus-visible:underline"
      href={href}
    >
      {children}
    </Link>
  ) : (
    children
  );
}

function RawLabels({ labels }: { labels: Record<string, string> }) {
  const entries = Object.entries(labels).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  if (entries.length === 0) {
    return (
      <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
        This template does not set any custom driver labels.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      {entries.map(([key, value]) => (
        <div
          className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)]"
          key={key}
        >
          <div className="min-w-0 break-all font-mono text-xs text-muted-foreground">
            {key}
          </div>
          <div className="min-w-0 break-all font-mono text-xs">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function ClusterTemplateDetailClient({
  projectId,
  regionId,
  templateId,
}: ClusterTemplateDetailClientProps) {
  const queryClient = useQueryClient();
  const query = useMemo(
    () => clusterTemplateQueryOptions(regionId, projectId, templateId),
    [projectId, regionId, templateId],
  );
  const { data: template } = useSuspenseQuery(query);
  const { data: images = [] } = useQuery(
    imagesQueryOptions(regionId, projectId),
  );
  const { data: flavors = [] } = useQuery(
    flavorsQueryOptions(regionId, projectId),
  );
  const { data: networks = [] } = useQuery(
    networksQueryOptions(regionId, projectId),
  );
  const { data: subnets = [] } = useQuery(
    visibleSubnetsQueryOptions(regionId, projectId),
  );
  const [editing, setEditing] = useState(false);
  const labels = template.labels ?? {};
  const image = images.find(
    (candidate) =>
      candidate.id === template.image_id ||
      candidate.name === template.image_id,
  );
  const workerFlavor = flavors.find(
    (candidate) =>
      candidate.id === template.flavor_id ||
      candidate.name === template.flavor_id,
  );
  const controlFlavor = flavors.find(
    (candidate) =>
      candidate.id === template.master_flavor_id ||
      candidate.name === template.master_flavor_id,
  );
  const externalNetwork = networks.find(
    (candidate) =>
      candidate.id === template.external_network_id ||
      candidate.name === template.external_network_id,
  );
  const fixedNetwork = networks.find(
    (candidate) =>
      candidate.id === template.fixed_network ||
      candidate.name === template.fixed_network,
  );
  const fixedSubnet = subnets.find(
    (candidate) =>
      candidate.id === template.fixed_subnet ||
      candidate.name === template.fixed_subnet,
  );
  const version = normalizeKubernetesVersion(labels.kube_tag);
  const editable = template.project_id === projectId;
  const customLabels = Object.fromEntries(
    Object.entries(labels).filter(
      ([key]) => !MAGNUM_DRIVER_LABEL_KEYS.has(key),
    ),
  );

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {template.name}
            </h1>
            <Badge variant={template.public ? "default" : "secondary"}>
              {template.public ? "Public" : "Private"}
            </Badge>
          </div>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {template.uuid}
          </p>
        </div>
        {editable ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
        ) : null}
      </div>

      {!editable ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          This public template is owned by another project and is read-only
          here.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          detail="Applied to every node group"
          icon={Gauge}
          label="Kubernetes version"
          value={version}
        />
        <SummaryTile
          detail={magnumImageDistribution(image) || "OS metadata unavailable"}
          icon={Cloud}
          label="Node image"
          value={image?.name || template.image_id || "-"}
        />
        <SummaryTile
          detail={`${controlFlavor?.name || template.master_flavor_id || "-"} control plane`}
          icon={Boxes}
          label="Worker flavor"
          value={workerFlavor?.name || template.flavor_id || "-"}
        />
        <SummaryTile
          detail={
            editable ? "Owned by this project" : "Read-only in this project"
          }
          icon={Eye}
          label="Visibility"
          value={template.public ? "Public" : "Private"}
        />
      </div>

      <Tabs className="space-y-4" defaultValue="overview">
        <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="networking">Networking</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="overview">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Cluster foundation">
              <DetailField label="Kubernetes version">{version}</DetailField>
              <DetailField label="Node image">
                <ResourceLink
                  href={image ? `/compute/images/${image.id}` : undefined}
                >
                  {image?.name || template.image_id || "-"}
                </ResourceLink>
              </DetailField>
              <DetailField label="Distribution">
                {magnumImageDistribution(image) || "-"}
              </DetailField>
              <DetailField label="Control plane flavor">
                <ResourceLink
                  href={
                    controlFlavor
                      ? `/compute/instance-flavors/${controlFlavor.id}`
                      : undefined
                  }
                >
                  {controlFlavor?.name || template.master_flavor_id || "-"}
                </ResourceLink>
              </DetailField>
              <DetailField label="Worker flavor">
                <ResourceLink
                  href={
                    workerFlavor
                      ? `/compute/instance-flavors/${workerFlavor.id}`
                      : undefined
                  }
                >
                  {workerFlavor?.name || template.flavor_id || "-"}
                </ResourceLink>
              </DetailField>
            </DetailSection>
            <DetailSection title="Operations">
              <DetailField label="Automatic healing">
                {yesNo(labelBoolean(labels.auto_healing_enabled, true))}
              </DetailField>
              <DetailField label="Automatic worker scaling">
                {yesNo(labelBoolean(labels.auto_scaling_enabled, false))}
              </DetailField>
              <DetailField label="API load balancer">
                {yesNo(template.master_lb_enabled)}
              </DetailField>
              <DetailField label="Public API address">
                {yesNo(
                  labelBoolean(
                    labels.master_lb_floating_ip_enabled,
                    template.floating_ip_enabled ?? true,
                  ),
                )}
              </DetailField>
            </DetailSection>
          </div>
          <DetailSection title="Template identity">
            <DetailField label="ID" className="font-mono text-xs">
              {template.uuid}
            </DetailField>
            <DetailField label="Owner project" className="font-mono text-xs">
              {template.project_id || "-"}
            </DetailField>
            <DetailField label="Created">
              {template.created_at || "-"}
            </DetailField>
            <DetailField label="Updated">
              {template.updated_at || "-"}
            </DetailField>
          </DetailSection>
        </TabsContent>

        <TabsContent className="space-y-4" value="networking">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Kubernetes networking">
              <DetailField label="Pod network">
                {template.network_driver || "-"}
              </DetailField>
              <DetailField label="Pod CIDR">
                {labels.cilium_ipv4pool ||
                  labels.calico_ipv4pool ||
                  "10.100.0.0/16 (driver default)"}
              </DetailField>
              <DetailField label="Service CIDR">
                {labels.service_cluster_ip_range ||
                  "10.254.0.0/16 (driver default)"}
              </DetailField>
              <DetailField label="Cluster domain">
                {labels.dns_cluster_domain || "cluster.local (driver default)"}
              </DetailField>
              <DetailField label="DNS resolvers">
                {template.dns_nameserver || "-"}
              </DetailField>
            </DetailSection>
            <DetailSection title="OpenStack networking">
              <DetailField label="External network">
                <ResourceLink
                  href={
                    externalNetwork
                      ? `/compute/networks/resources/${externalNetwork.id}`
                      : undefined
                  }
                >
                  {externalNetwork?.name || template.external_network_id || "-"}
                </ResourceLink>
              </DetailField>
              <DetailField label="Fixed network">
                <ResourceLink
                  href={
                    fixedNetwork
                      ? `/compute/networks/resources/${fixedNetwork.id}`
                      : undefined
                  }
                >
                  {fixedNetwork?.name || template.fixed_network || "Automatic"}
                </ResourceLink>
              </DetailField>
              <DetailField label="Fixed subnet">
                {fixedSubnet?.name ||
                  fixedSubnet?.cidr ||
                  template.fixed_subnet ||
                  "Automatic"}
              </DetailField>
              <DetailField label="Created subnet CIDR">
                {labels.fixed_subnet_cidr || "10.0.0.0/24 (driver default)"}
              </DetailField>
              <DetailField label="Requested API floating IP">
                {labels.api_server_floating_ip || "Automatic"}
              </DetailField>
            </DetailSection>
          </div>
          <DetailSection title="OpenStack load balancing">
            <DetailField label="Octavia provider">
              {labels.octavia_provider || "amphorav2 (driver default)"}
            </DetailField>
            <DetailField label="Service algorithm">
              {labels.octavia_lb_algorithm || "Provider default"}
            </DetailField>
            <DetailField label="Service health monitors">
              {yesNo(labelBoolean(labels.octavia_lb_healthcheck, true))}
            </DetailField>
            <DetailField label="API load balancer flavor">
              {labels.api_server_lb_flavor || "Cloud default"}
            </DetailField>
            <DetailField label="API load balancer availability zone">
              {labels.api_server_lb_availability_zone || "Cloud default"}
            </DetailField>
          </DetailSection>
        </TabsContent>

        <TabsContent className="space-y-4" value="storage">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Node storage">
              <DetailField label="Boot volume size">
                {labels.boot_volume_size
                  ? `${labels.boot_volume_size} GiB`
                  : "Cloud configuration"}
              </DetailField>
              <DetailField label="Boot volume type">
                {labels.boot_volume_type || "Cloud default"}
              </DetailField>
              <DetailField label="Boot volume availability zone">
                {labels.boot_volume_availability_zone ||
                  labels.availability_zone ||
                  "Inherited"}
              </DetailField>
              <DetailField label="etcd volume">
                {Number(labels.etcd_volume_size || 0) > 0
                  ? `${labels.etcd_volume_size} GiB`
                  : "Root disk"}
              </DetailField>
              <DetailField label="etcd volume type">
                {labels.etcd_volume_type || "Cloud default"}
              </DetailField>
              <DetailField label="Legacy container volume">
                {template.docker_volume_size
                  ? `${template.docker_volume_size} GiB`
                  : "Disabled"}
              </DetailField>
            </DetailSection>
            <DetailSection title="Workload storage">
              <DetailField label="Cinder CSI">
                {yesNo(labelBoolean(labels.cinder_csi_enabled, true))}
              </DetailField>
              <DetailField label="Cinder CSI image">
                {labels.cinder_csi_plugin_tag || "Driver default"}
              </DetailField>
              <DetailField label="Manila CSI">
                {yesNo(labelBoolean(labels.manila_csi_enabled, true))}
              </DetailField>
              <DetailField label="Manila CSI image">
                {labels.manila_csi_plugin_tag || "Driver default"}
              </DetailField>
              <DetailField label="Manila share network">
                {labels.manila_csi_share_network_id || "Not configured"}
              </DetailField>
            </DetailSection>
          </div>
        </TabsContent>

        <TabsContent className="space-y-4" value="security">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Kubernetes API security">
              <DetailField label="TLS">
                {template.tls_disabled ? "Disabled" : "Enabled"}
              </DetailField>
              <DetailField label="Additional certificate SANs">
                {labels.api_server_cert_sans || "None"}
              </DetailField>
              <DetailField label="Additional admission plugins">
                {labels.admission_control_list || "None"}
              </DetailField>
              <DetailField label="Keystone authentication">
                {yesNo(labelBoolean(labels.keystone_auth_enabled, true))}
              </DetailField>
              <DetailField label="SSH key pair">
                {template.keypair_id || "Selected when the cluster is created"}
              </DetailField>
            </DetailSection>
            <DetailSection title="OpenID Connect">
              <DetailField label="Issuer URL">
                {labels.oidc_issuer_url || "Not configured"}
              </DetailField>
              <DetailField label="Client ID">
                {labels.oidc_client_id || "-"}
              </DetailField>
              <DetailField label="Username claim">
                {labels.oidc_username_claim || "sub"}
              </DetailField>
              <DetailField label="Groups claim">
                {labels.oidc_groups_claim || "-"}
              </DetailField>
            </DetailSection>
          </div>
          <DetailSection title="Audit logging">
            <DetailField label="Audit log">
              {yesNo(labelBoolean(labels.audit_log_enabled, false))}
            </DetailField>
            <DetailField label="Retention">
              {labels.audit_log_max_age || "30"} days
            </DetailField>
            <DetailField label="Backup files">
              {labels.audit_log_max_backup || "10"}
            </DetailField>
            <DetailField label="Maximum file size">
              {labels.audit_log_max_size || "100"} MiB
            </DetailField>
          </DetailSection>
        </TabsContent>

        <TabsContent className="space-y-4" value="components">
          <div>
            <h2 className="text-sm font-semibold">
              Placement and component versions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Version overrides are intentionally optional. Unset values follow
              the tested versions shipped by the Magnum Cluster API driver.
            </p>
          </div>
          <DriverConfigurationTable
            categories={["Placement", "Component images"]}
            labels={labels}
            networkDriver={template.network_driver}
          />
          <DetailSection title="Proxy configuration">
            <DetailField label="HTTP proxy">
              {template.http_proxy || "Not configured"}
            </DetailField>
            <DetailField label="HTTPS proxy">
              {template.https_proxy || "Not configured"}
            </DetailField>
            <DetailField label="No proxy">
              {template.no_proxy || "Not configured"}
            </DetailField>
          </DetailSection>
        </TabsContent>

        <TabsContent className="space-y-4" value="labels">
          <div>
            <h2 className="text-sm font-semibold">
              Effective driver configuration
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Explicit labels override driver defaults. Leaving a field
              unchanged avoids pinning a default into the template.
            </p>
          </div>
          <DriverConfigurationTable
            labels={labels}
            networkDriver={template.network_driver}
          />
          <section className="space-y-2">
            <div>
              <h2 className="text-sm font-semibold">Custom labels</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Labels not managed by Sunrise are preserved during edits.
              </p>
            </div>
            <RawLabels labels={customLabels} />
          </section>
        </TabsContent>
      </Tabs>

      {editing ? (
        <ClusterTemplateMutationSheet
          key={template.uuid}
          open
          projectId={projectId}
          regionId={regionId}
          template={template}
          onOpenChange={setEditing}
          onComplete={async () => {
            setEditing(false);
            await queryClient.invalidateQueries({ queryKey: query.queryKey });
          }}
        />
      ) : null}
    </div>
  );
}

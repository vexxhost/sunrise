import { formatDistanceToNow, parseISO } from "date-fns";
import bytes from "bytes";
import type { ReactNode } from "react";
import {
  CircleAlert,
  Cpu,
  HardDrive,
  MapPin,
  Network,
  type LucideIcon,
} from "lucide-react";

import SecurityGroupListByNames from "@/components/Instance/GroupList";
import { InstanceInfo } from "@/components/Instance/InstanceInfo";
import { ServerIPAddresses } from "@/components/Instance/IpAddressList";
import VolumeInfo from "@/components/Instance/VolumeInfo";
import { normalizeOpenStackTimestamp } from "@/lib/openstack/time";
import type { AddressItem, Server } from "@/types/openstack";
import type { ResolvedServerFlavor } from "@/lib/openstack/server-flavor";
import { ResourceLink } from "@/components/resources/ResourceLink";

interface InstanceOverviewProps {
  projectId?: string;
  regionId?: string;
  server: Server;
  flavor: ResolvedServerFlavor;
}

interface SummaryItemProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail: string;
}

function SummaryItem({ icon: Icon, label, value, detail }: SummaryItemProps) {
  return (
    <div className="min-w-0 bg-background p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 truncate text-base font-semibold">
        {value}
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function flattenAddresses(server: Server): AddressItem[] {
  return Object.values(server.addresses).flat();
}

function primaryAddress(server: Server) {
  const addresses = flattenAddresses(server);
  return (
    addresses.find((address) => address["OS-EXT-IPS:type"] === "floating") ??
    addresses.find((address) => address.version === 4) ??
    addresses[0]
  );
}

function instanceAge(server: Server) {
  try {
    return formatDistanceToNow(parseISO(normalizeOpenStackTimestamp(server.created)));
  } catch {
    return "Unknown age";
  }
}

function ServerFault({ server }: { server: Server }) {
  if (server.status.toUpperCase() !== "ERROR") return null;

  return (
    <section
      className="border-y border-destructive/40 bg-destructive/5 px-4 py-3"
      aria-labelledby="server-fault-title"
    >
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0">
          <h2 id="server-fault-title" className="text-sm font-semibold text-destructive">
            Instance error
          </h2>
          <p className="mt-1 text-sm">
            {server.fault?.message || "Nova reported an error without additional details."}
          </p>
          {server.fault?.details ? (
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono">
                {server.fault.details}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function InstanceOverview({
  projectId,
  regionId,
  server,
  flavor: resolvedFlavor,
}: InstanceOverviewProps) {
  const addresses = flattenAddresses(server);
  const address = primaryAddress(server);
  const volumeCount = server["os-extended-volumes:volumes_attached"].length;
  const flavor = server.flavor;
  const bootSource = server.image
    ? "Image-backed"
    : volumeCount
      ? "Volume-backed"
      : "Unknown";

  return (
    <div className="space-y-6">
      <ServerFault server={server} />

      <section aria-labelledby="instance-summary-title">
        <h2 id="instance-summary-title" className="sr-only">
          Instance at a glance
        </h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border xl:grid-cols-4">
          <SummaryItem
            icon={Cpu}
            label="Compute"
            value={
              resolvedFlavor.id ? (
                <ResourceLink
                  href={`/compute/instance-flavors/${encodeURIComponent(resolvedFlavor.id)}`}
                >
                  {resolvedFlavor.name}
                </ResourceLink>
              ) : (
                resolvedFlavor.name
              )
            }
            detail={`${flavor.vcpus} vCPU · ${bytes(flavor.ram * 1024 * 1024, { unitSeparator: " " })} RAM`}
          />
          <SummaryItem
            icon={Network}
            label="Primary address"
            value={address?.addr || "No address"}
            detail={`${addresses.length} ${addresses.length === 1 ? "address" : "addresses"} attached`}
          />
          <SummaryItem
            icon={HardDrive}
            label="Boot source"
            value={bootSource}
            detail={`${volumeCount} attached ${volumeCount === 1 ? "volume" : "volumes"}`}
          />
          <SummaryItem
            icon={MapPin}
            label="Placement"
            value={server["OS-EXT-AZ:availability_zone"] || "Default zone"}
            detail={`Created ${instanceAge(server)} ago`}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <InstanceInfo server={server} />
          <ServerIPAddresses server={server} />
        </div>
        <div className="space-y-6">
          <VolumeInfo server={server} regionId={regionId} projectId={projectId} />
          <SecurityGroupListByNames
            server={server}
            regionId={regionId}
            projectId={projectId}
          />
        </div>
      </div>
    </div>
  );
}

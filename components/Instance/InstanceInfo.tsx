import { formatDistanceToNow, parseISO } from 'date-fns';
import { Server } from "@/types/openstack";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import {
  formatServerPowerState,
  formatServerStatus,
  formatServerTaskState,
} from "@/lib/openstack/server-state";
import { normalizeOpenStackTimestamp } from "@/lib/openstack/time";

export function InstanceInfo({ server }: { server: Server }) {
  const metadata = Object.entries(server.metadata ?? {});

  return (
    <>
      <DetailSection title="Configuration">
        {server.description ? (
          <DetailField label="Description">{server.description}</DetailField>
        ) : null}
        <DetailField label="Availability Zone">
          {server["OS-EXT-AZ:availability_zone"]}
        </DetailField>
        <DetailField label="Key pair">{server.key_name || "No key pair"}</DetailField>
        <DetailField label="Created">{server.created}</DetailField>
        <DetailField label="Age">
          {formatDistanceToNow(parseISO(normalizeOpenStackTimestamp(server.created)))}
        </DetailField>
      </DetailSection>
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">
          Identifiers and advanced details
        </summary>
        <div className="mt-3 overflow-hidden rounded-md border">
          <DetailField label="Instance ID" className="font-mono text-xs">
            {server.id}
          </DetailField>
          <DetailField label="Project ID" className="font-mono text-xs">
            {server.tenant_id}
          </DetailField>
          <DetailField label="Status">{formatServerStatus(server.status)}</DetailField>
          <DetailField label="Task State">
            {formatServerTaskState(server["OS-EXT-STS:task_state"])}
          </DetailField>
          <DetailField label="Power State">
            {formatServerPowerState(server["OS-EXT-STS:power_state"])}
          </DetailField>
          <DetailField label="Disk configuration">{server["OS-DCF:diskConfig"]}</DetailField>
          <DetailField label="Config drive">{server.config_drive || "Disabled"}</DetailField>
        </div>
      </details>
      <DetailSection title="Metadata">
        {metadata.length ? (
          metadata.map(([key, value]) => (
            <DetailField key={key} label={key}>{value}</DetailField>
          ))
        ) : (
          <DetailField label="Metadata">No metadata configured</DetailField>
        )}
      </DetailSection>
    </>
  )
}

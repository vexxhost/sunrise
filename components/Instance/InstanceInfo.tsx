import { formatDistanceToNow, parseISO } from 'date-fns';
import { Server } from "@/types/openstack";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";

export function InstanceInfo({ server }: { server: Server }) {
  return (
    <DetailSection title="Instance">
      <DetailField label="Name">{server.name}</DetailField>
      <DetailField label="ID" className="font-mono text-xs">
        {server.id}
      </DetailField>
      <DetailField label="Description" />
      <DetailField label="Project ID" className="font-mono text-xs">
        {server.tenant_id}
      </DetailField>
      <DetailField label="Status">{server.status}</DetailField>
      <DetailField label="Power State">
        {server["OS-EXT-STS:power_state"]}
      </DetailField>
      <DetailField label="Availability Zone">
        {server["OS-EXT-AZ:availability_zone"]}
      </DetailField>
      <DetailField label="Created">{server.created}</DetailField>
      <DetailField label="Age">
        {formatDistanceToNow(parseISO(server.created))}
      </DetailField>
    </DetailSection>
  )
}

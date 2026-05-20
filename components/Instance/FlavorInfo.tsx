import { Server } from "@/types/openstack";
import bytes from "bytes";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";

interface FlavorInfoProps {
    server: Server;
}

export function FlavorInfo({ server }: FlavorInfoProps) {
    const flavor = server.flavor;

    return (
        <DetailSection title="Specs">
          <DetailField label="Flavor Name">{flavor.original_name}</DetailField>
          <DetailField label="RAM">
            {bytes(flavor.ram * 1024 * 1024, { unitSeparator: ' ' })}
          </DetailField>
          <DetailField label="VCPU">{flavor.vcpus}</DetailField>
          <DetailField label="Disk">{flavor.disk} GB</DetailField>
        </DetailSection>
    )
}

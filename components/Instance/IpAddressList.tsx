import { AddressItem, Server } from "@/types/openstack";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";

export function ServerIPAddresses({ server }: { server: Server }) {
    const serverAddressKeys = Object.keys(server.addresses);
    return (
      <DetailSection title="IP Addresses">
        {serverAddressKeys.length > 0 ? (
          serverAddressKeys.map((key) => (
            <DetailField key={key} label={key}>
              {server.addresses[key]
                .map((address: AddressItem) => address.addr)
                .join(", ")}
            </DetailField>
          ))
        ) : (
          <DetailField label="Addresses" />
        )}
      </DetailSection>
    )
}

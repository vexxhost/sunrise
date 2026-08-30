import { AddressItem, Server } from "@/types/openstack";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";

export function ServerIPAddresses({ server }: { server: Server }) {
    const serverAddressKeys = Object.keys(server.addresses);
    return (
      <DetailSection title="Network addresses">
        {serverAddressKeys.length > 0 ? (
          serverAddressKeys.map((key) => (
            <DetailField key={key} label={key}>
              <div className="space-y-1.5">
                {server.addresses[key].map((address: AddressItem) => (
                  <div key={address.addr} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs">{address.addr}</span>
                    <span className="text-xs text-muted-foreground">
                      {address["OS-EXT-IPS:type"] === "floating" ? "Floating" : "Fixed"}
                      {` IPv${address.version}`}
                    </span>
                  </div>
                ))}
              </div>
            </DetailField>
          ))
        ) : (
          <DetailField label="Addresses" />
        )}
      </DetailSection>
    )
}

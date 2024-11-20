import { AddressItem, Server } from "@/lib/nova";

export async function ServerIPAddresses({ server }: { server: Server }) {
    const serverAddressKeys = Object.keys(server.addresses);
    return (
        <>
    <div className="font-bold text-l mt-2 p-4"> IP Addresses</div>
      {serverAddressKeys.map((key, index) => (
        <div key={index} className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">{key}:</div>
          <div className="basis-3/4">
            {server.addresses[key]
              .map((address: AddressItem) => address.addr)
              .join(", ")}
          </div>
        </div>
      ))}
    </>
    )
}
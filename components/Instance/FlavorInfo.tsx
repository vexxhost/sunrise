import { Flavor, getFlavor, Server } from "@/lib/nova";
import { formatMBtoGB } from "@/lib/utils";

export async function FlavorInfo({ server }: { server: Server }) {
    const flavor: Flavor = await getFlavor(server.flavor.id);

    return (
        <>
        <div className="font-bold text-l mt-2 p-4">Specs</div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">Flavor Name:</div>
          <div className="basis-3/4">{flavor.name.toString()}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">Flavor ID:</div>
          <div className="basis-3/4">{flavor.id}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">RAM:</div>
          <div className="basis-3/4">{formatMBtoGB(flavor.ram)}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">VCPU:</div>
          <div className="basis-3/4">{flavor.vcpus}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">DISK:</div>
          <div className="basis-3/4">{flavor.disk} GB</div>
        </div>
        </>
    )
}
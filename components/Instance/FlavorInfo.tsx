import { Server } from "@/types/openstack";
import bytes from "bytes";

interface FlavorInfoProps {
    server: Server;
}

export function FlavorInfo({ server }: FlavorInfoProps) {
    const flavor = server.flavor;

    return (
        <>
        <div className="font-bold text-l mt-2 p-4">Specs</div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">Flavor Name:</div>
          <div className="basis-3/4">{flavor.original_name}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">RAM:</div>
          <div className="basis-3/4">{bytes(flavor.ram * 1024 * 1024, { unitSeparator: ' ' })}</div>
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

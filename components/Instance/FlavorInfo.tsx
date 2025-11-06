'use client';

import { useQuery } from "@tanstack/react-query";
import { Server } from "@/types/openstack";
import { flavorQueryOptions } from "@/hooks/queries/useServers";
import bytes from "bytes";

interface FlavorInfoProps {
    server: Server;
    regionId?: string;
    projectId?: string;
}

export function FlavorInfo({ server, regionId, projectId }: FlavorInfoProps) {
    const { data: flavor } = useQuery(flavorQueryOptions(regionId, projectId, server.flavor.id));

    if (!flavor) {
        return <div>Loading flavor...</div>;
    }

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

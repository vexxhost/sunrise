import { formattedTimeSinceDate } from "@/lib/isoDateUtils";
import { AddressItem, Server } from "@/lib/nova";
import { session } from "@/lib/session";

export async function InstanceInfo({ server }: { server: Server }) {
  const project = await session().get("selectedProject");
  const serverAddressKeys = Object.keys(server.addresses);
  return (

    <>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold">Name:</div>
          <div className="basis-3/4">{server.name}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold">ID:</div>
          <div className="basis-3/4">{server.id}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold">Description:</div>
          <div className="basis-3/4"> </div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">Project ID:</div>
          <div className="basis-3/4">{project.id}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">Status:</div>
          <div className="basis-3/4">{server.status}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">Power State:</div>
          <div className="basis-3/4">{server["OS-EXT-STS:power_state"]}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">Availability Zone:</div>
          <div className="basis-3/4">
            {server["OS-EXT-AZ:availability_zone"]}
          </div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 fon:51 p.m.t-bold text-m">Created:</div>
          <div className="basis-3/4">{server.created}</div>
        </div>
        <div className="flex flex-row  ml-2 pl-2 text-xs">
          <div className="basis-1/4 font-bold text-m">Age:</div>
          <div className="basis-3/4">
            {formattedTimeSinceDate(server.created)}
          </div>
        </div>
    </>
  )
}
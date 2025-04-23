import { listVolumes } from "@/lib/cinder";
import { listImages } from "@/lib/glance";
import React from "react";
// import { DataTable } from "./table";
import { session } from "@/lib/session";
import { columns } from "./columns";
import { DataTable } from "@/components/datatable";
import { searchoptions } from "./meta";
import { listNetworks } from "@/lib/network";



export const revalidate = 10;

export default async function Page() {
const networks = await listNetworks();
  const project = await session().get("selectedProject");

   return (
    <>
      <h1 className="text-4xl font-semibold mb-6 pb-2 border-b-2">Networks</h1>
             <DataTable data={networks} columns={columns} searchOptions={searchoptions}/>  
    </>
  )
}

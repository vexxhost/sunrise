import { listVolumes } from "@/lib/cinder";
import { listImages } from "@/lib/glance";
import React from "react";
// import { DataTable } from "./table";
import { session } from "@/lib/session";
import { columns } from "./columns";
import { DataTable } from "@/components/datatable";
import { searchoptions } from "./meta";


export const revalidate = 10;

export default async function Page({
  searchParams,
}: {
  searchParams?: {
    sort_dir?: string;
    sort_key?: string;
  };
}) {
  const volumes = await listVolumes();
  const images = await listImages();
  const project = await session().get("selectedProject");

  // @bug? the only working searchOption for nova api is name at the moment
  // @todo add support for image_name and flavor_name to SearchOptions

  const defaultServerOptions = {
    sort_dir: "desc",
    sort_key: "name",
  };


  
  return (
    <>
      <h1 className="text-4xl font-semibold mb-6 pb-2 border-b-2">Volumes</h1>
             <DataTable data={volumes} columns={columns} searchOptions={searchoptions}/>
           
    </>
  )
}
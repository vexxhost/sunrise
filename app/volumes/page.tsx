import { listVolumes } from "@/lib/cinder";
import { listImages } from "@/lib/glance";
import React from "react";
import { columns } from "./columns";
import { DataTable } from "./table";





export default async function Page() {
const volumes = await listVolumes();
const images = await listImages();

  return (
    <>
      <h1 className="text-4xl font-semibold mb-6 pb-2 border-b-2">Volumes</h1>
             <DataTable data={volumes} columns={columns} />
           
    </>
  );
}
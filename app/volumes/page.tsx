import { listVolumes } from "@/lib/cinder";
import { columns } from "./columns";
import { DataTable } from "@/components/datatable";
import { searchoptions } from "./meta";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    sort_dir?: string;
    sort_key?: string;
  }>;
}) {
  const volumes = await listVolumes();

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

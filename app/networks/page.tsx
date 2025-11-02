import { columns } from "./columns";
import { DataTable } from "@/components/datatable";
import { searchoptions } from "./meta";
import { listNetworks } from "@/lib/network";

export default async function Page() {
const networks = await listNetworks();
   return (
    <>
      <h1 className="text-4xl font-semibold mb-6 pb-2 border-b-2">Networks</h1>
             <DataTable data={networks} columns={columns} searchOptions={searchoptions}/>  
    </>
  )
}

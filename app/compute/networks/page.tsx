import { columns } from "./columns";
import { DataTableAsync } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { listNetworks } from "@/lib/network";

export default function Page() {
  const networksPromise = listNetworks();

  return (
    <DataTableAsync
      dataPromise={networksPromise}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="networks"
    />
  )
}

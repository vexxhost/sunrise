import { listFlavors } from "@/lib/nova";
import { columns } from "./columns";
import { DataTableAsync } from "@/components/DataTable";
import { searchoptions } from "./meta";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    sort_dir?: string;
    sort_key?: string;
  }>;
}) {
  const flavorsData = await listFlavors();
  const flavorsPromise = Promise.resolve(flavorsData.flavors);

  return (
    <DataTableAsync
      dataPromise={flavorsPromise}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="instance types"
    />
  )
}

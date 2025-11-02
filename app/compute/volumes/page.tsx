import { listVolumes } from "@/lib/cinder";
import { columns } from "./columns";
import { DataTableAsync } from "@/components/DataTable";
import { searchoptions } from "./meta";

export default function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    sort_dir?: string;
    sort_key?: string;
  }>;
}) {
  const volumesPromise = listVolumes();

  return (
    <DataTableAsync
      dataPromise={volumesPromise}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="volumes"
    />
  )
}

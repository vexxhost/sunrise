import { listSnapshots } from "@/lib/cinder";
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
  const snapshotsPromise = listSnapshots();

  return (
    <DataTableAsync
      dataPromise={snapshotsPromise}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="snapshots"
    />
  )
}

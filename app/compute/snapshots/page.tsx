'use client';

import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { Camera } from "lucide-react";
import { useSnapshots } from "@/hooks/queries";

export default function Page() {
  const { data, isLoading, isRefetching, refetch } = useSnapshots();

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="snapshot"
      emptyIcon={Camera}
    />
  );
}

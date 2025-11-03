'use client';

import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { HardDrive } from "lucide-react";
import { useVolumes } from "@/hooks/queries";

export default function Page() {
  const { data, isLoading, isRefetching, refetch } = useVolumes();

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="volume"
      emptyIcon={HardDrive}
    />
  );
}

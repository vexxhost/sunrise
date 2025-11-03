'use client';

import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { Network } from "lucide-react";
import { useNetworks } from "@/hooks/queries";

export default function Page() {
  const { data, isLoading, isRefetching, refetch } = useNetworks();

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="network"
      emptyIcon={Network}
    />
  );
}

'use client';

import { useQuery } from "@tanstack/react-query";
import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { network } from "@/lib/client";
import { Network } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export default function Page() {
  const { region } = useRegion();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['networks', region],
    queryFn: async () => {
      return await network.listNetworks();
    },
  });

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

'use client';

import { useQuery } from "@tanstack/react-query";
import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { nova } from "@/lib/client";
import { Cpu } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export default function Page() {
  const { region } = useRegion();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['flavors', region],
    queryFn: async () => {
      const flavorsData = await nova.listFlavors();
      return flavorsData.flavors;
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
      resourceName="instance type"
      emptyIcon={Cpu}
    />
  );
}

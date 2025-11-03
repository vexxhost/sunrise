'use client';

import { useQuery } from "@tanstack/react-query";
import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { cinder } from "@/lib/client";
import { HardDrive } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export default function Page() {
  const { region } = useRegion();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['volumes', region],
    queryFn: async () => {
      return await cinder.listVolumes();
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
      resourceName="volume"
      emptyIcon={HardDrive}
    />
  );
}

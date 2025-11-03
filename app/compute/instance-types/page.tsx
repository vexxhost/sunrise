'use client';

import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { Cpu } from "lucide-react";
import { useFlavors } from "@/hooks/queries";

export default function Page() {
  const { data, isLoading, isRefetching, refetch } = useFlavors();

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="instance type"
      emptyIcon={Cpu}
    />
  );
}

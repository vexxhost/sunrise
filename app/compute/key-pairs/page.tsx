'use client';

import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { KeyRound } from "lucide-react";
import { useKeypairs } from "@/hooks/queries/useServers";

export default function Page() {
  const { data, isLoading, isRefetching, refetch } = useKeypairs();

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="key pair"
      emptyIcon={KeyRound}
    />
  );
}

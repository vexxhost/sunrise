'use client';

import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { ImageIcon } from "lucide-react";
import { useImages } from "@/hooks/queries";

export default function Page() {
  const { data, isLoading, isRefetching, refetch } = useImages();

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="image"
      emptyIcon={ImageIcon}
    />
  );
}

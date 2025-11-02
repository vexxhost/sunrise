'use client';

import { useCallback } from "react";
import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { nova } from "@/lib/client";
import { Cpu } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export default function Page() {
  const { region } = useRegion();

  const fetchFlavors = useCallback(async () => {
    const flavorsData = await nova.listFlavors();
    return flavorsData.flavors;
  }, [region]);

  return (
    <DataTable
      fetchData={fetchFlavors}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="instance type"
      emptyIcon={Cpu}
    />
  );
}

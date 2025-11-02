'use client';

import { useCallback } from "react";
import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { cinder } from "@/lib/client";
import { HardDrive } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export default function Page() {
  const { region } = useRegion();

  const fetchVolumes = useCallback(async () => {
    return await cinder.listVolumes();
  }, [region]);

  return (
    <DataTable
      fetchData={fetchVolumes}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="volume"
      emptyIcon={HardDrive}
    />
  );
}

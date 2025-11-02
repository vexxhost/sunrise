'use client';

import { useCallback } from "react";
import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { cinder } from "@/lib/client";
import { Camera } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export default function Page() {
  const { region } = useRegion();

  const fetchSnapshots = useCallback(async () => {
    return await cinder.listSnapshots();
  }, [region]);

  return (
    <DataTable
      fetchData={fetchSnapshots}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="snapshot"
      emptyIcon={Camera}
    />
  );
}

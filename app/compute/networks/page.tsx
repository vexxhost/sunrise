'use client';

import { useCallback } from "react";
import { columns } from "./columns";
import { DataTable } from "@/components/DataTable";
import { searchoptions } from "./meta";
import { network } from "@/lib/client";
import { Network } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

export default function Page() {
  const { region } = useRegion();

  const fetchNetworks = useCallback(async () => {
    return await network.listNetworks();
  }, [region]);

  return (
    <DataTable
      fetchData={fetchNetworks}
      columns={columns}
      searchOptions={searchoptions}
      resourceName="network"
      emptyIcon={Network}
    />
  );
}

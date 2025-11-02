'use client';

import { createInstanceColumns } from "./columns";
import { DataTableAsync } from "@/components/DataTable";
import { searchOptions } from "./meta";
import { Server } from "@/lib/nova";

interface InstancesTableProps {
  serversPromise: Promise<Server[]>;
  images: { [key: string]: string };
  flavors: { [key: string]: string };
  volumeImageIds: { [key: string]: string };
}

export function InstancesTable({ serversPromise, images, flavors, volumeImageIds }: InstancesTableProps) {
  const columns = createInstanceColumns({ images, flavors, volumeImageIds });

  return (
    <DataTableAsync
      dataPromise={serversPromise}
      columns={columns}
      searchOptions={searchOptions}
      defaultColumnVisibility={{
        id: false,
        alert: false,
        'OS-EXT-AZ:availability_zone': false,
        task: false
      }}
      resourceName="instances"
    />
  );
}

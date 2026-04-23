'use client';

import { useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { ImageIcon } from "lucide-react";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { Badge } from "@/components/ui/badge";
import { Image } from "@/types/openstack/glance";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";
import bytes from 'bytes';

const columns: ColumnDef<Image>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Image } }) => row.original.name || "-",
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "id",
    header: "ID",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: true
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: { original: Image } }) => {
      const status = titleCase(row.original.status);
      let variant: "default" | "secondary" | "destructive" | "outline";

      // Determine the badge variant based on the status value
      switch (row.original.status) {
        case "active":
          variant = "default";
          break;
        case "queued":
        case "saving":
        case "uploading":
        case "importing":
          variant = "secondary";
          break;
        case "killed":
        case "deleted":
        case "pending_delete":
          variant = "destructive";
          break;
        case "deactivated":
        default:
          variant = "outline";
          break;
      }

      return (
        <Badge variant={variant}>
          {status}
        </Badge>
      );
    },
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "visibility",
    header: "Visibility",
    cell: ({ row }: { row: { original: Image } }) => {
      const visibility = titleCase(row.original.visibility);
      let variant: "default" | "secondary" | "destructive" | "outline";

      switch (row.original.visibility) {
        case "public":
          variant = "default";
          break;
        case "community":
          variant = "secondary";
          break;
        case "shared":
        case "private":
        default:
          variant = "outline";
          break;
      }

      return (
        <Badge variant={variant}>
          {visibility}
        </Badge>
      );
    },
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }: { row: { original: Image } }) => {
      if (row.original.size === null || row.original.size === undefined) {
        return "-";
      }
      return bytes(row.original.size, { unitSeparator: ' ' });
    },
    meta: {
      fieldType: "number",
      visible: true
    }
  },
  {
    accessorKey: "virtual_size",
    header: "Virtual Size",
    cell: ({ row }: { row: { original: Image } }) => {
      if (row.original.virtual_size === null || row.original.virtual_size === undefined) {
        return "-";
      }
      return bytes(row.original.virtual_size, { unitSeparator: ' ' });
    },
    meta: {
      fieldType: "number",
      visible: false
    }
  },
  {
    accessorKey: "disk_format",
    header: "Disk Format",
    cell: ({ row }: { row: { original: Image } }) => row.original.disk_format || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: true
    }
  },
  {
    accessorKey: "container_format",
    header: "Container Format",
    cell: ({ row }: { row: { original: Image } }) => row.original.container_format || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "min_disk",
    header: "Minimum Disk Space",
    cell: ({ row }: { row: { original: Image } }) => {
      return row.original.min_disk > 0 ? `${row.original.min_disk} GB` : "-";
    },
    meta: {
      fieldType: "number",
      visible: false
    }
  },
  {
    accessorKey: "min_ram",
    header: "Minimum Memory",
    cell: ({ row }: { row: { original: Image } }) => {
      return row.original.min_ram > 0 ? `${row.original.min_ram} MB` : "-";
    },
    meta: {
      fieldType: "number",
      visible: false
    }
  },
  {
    accessorKey: "checksum",
    header: "Checksum",
    cell: ({ row }: { row: { original: Image } }) => row.original.checksum || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "os_hash_algo",
    header: "Hash Algorithm",
    cell: ({ row }: { row: { original: Image } }) => row.original.os_hash_algo || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "os_hash_value",
    header: "Hash Value",
    cell: ({ row }: { row: { original: Image } }) => row.original.os_hash_value || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "protected",
    header: "Protected",
    cell: ({ row }: { row: { original: Image } }) => row.original.protected ? "Yes" : "No",
    meta: {
      fieldType: "boolean",
      visible: false
    }
  },
  {
    accessorKey: "os_hidden",
    header: "Hidden",
    cell: ({ row }: { row: { original: Image } }) => row.original.os_hidden ? "Yes" : "No",
    meta: {
      fieldType: "boolean",
      visible: false
    }
  },
  {
    accessorKey: "owner",
    header: "Owner",
    cell: ({ row }: { row: { original: Image } }) => row.original.owner || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "direct_url",
    header: "Direct URL",
    cell: ({ row }: { row: { original: Image } }) => row.original.direct_url || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    meta: {
      fieldType: "date",
      visible: true
    }
  },
  {
    accessorKey: "updated_at",
    header: "Updated At",
    meta: {
      fieldType: "date",
      visible: false
    }
  },
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ row }: { row: { original: Image } }) => {
      const tags = row.original.tags;
      if (!tags || tags.length === 0) {
        return "-";
      }
      return (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag, index) => (
            <Badge key={index} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{tags.length - 3}
            </Badge>
          )}
        </div>
      );
    },
    meta: {
      fieldType: "string",
      visible: false
    }
  }
];

interface ImagesClientProps {
  regionId?: string;
  projectId?: string;
}

export function ImagesClient({ regionId, projectId }: ImagesClientProps) {
  const { data, isRefetching, refetch } = useSuspenseQuery(imagesQueryOptions(regionId, projectId));

  return (
    <DataTable
      data={data}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="image"
      emptyIcon={ImageIcon}
    />
  );
}

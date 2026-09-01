"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ComponentType } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Cloud, Network, Pencil, Settings, Trash2 } from "lucide-react";
import { ClusterTemplateMutationSheet } from "@/components/Kubernetes/ClusterTemplateMutationSheet";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { IDCell } from "@/components/DataTable/IDCell";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { clusterTemplatesQueryOptions } from "@/hooks/queries/useMagnum";
import { flavorsQueryOptions } from "@/hooks/queries/useServers";
import { deleteClusterTemplateAction } from "@/lib/openstack/magnum-actions";
import { magnumImageDistribution } from "@/lib/openstack/magnum-domain";
import { cn } from "@/lib/utils";
import type { Flavor, Image, MagnumClusterTemplate } from "@/types/openstack";

interface TemplatesClientProps {
  regionId?: string;
  projectId?: string;
}

function uniqueValues(
  templates: MagnumClusterTemplate[],
  accessor: (template: MagnumClusterTemplate) => string | undefined,
) {
  return new Set(
    templates
      .map((template) => accessor(template))
      .filter((value): value is string => Boolean(value)),
  ).size;
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function FadedTableText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const displayValue = value || "-";
  const spacerValue = displayValue.slice(0, 16);

  return (
    <span
      className={cn(
        "group/faded relative block w-full min-w-0 flex-shrink-0",
        className,
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0 z-10 block w-full overflow-hidden whitespace-nowrap",
          "[mask-image:linear-gradient(to_right,black_calc(100%_-_3rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%_-_3rem),transparent)]",
          "group-hover/faded:left-[-9px] group-hover/faded:top-[-5px] group-hover/faded:z-50 group-hover/faded:w-auto group-hover/faded:max-w-[min(80vw,48rem)]",
          "group-hover/faded:overflow-visible group-hover/faded:rounded-md group-hover/faded:border group-hover/faded:border-border group-hover/faded:bg-popover",
          "group-hover/faded:px-2 group-hover/faded:py-1 group-hover/faded:text-popover-foreground group-hover/faded:underline",
          "group-hover/faded:[mask-image:none] group-hover/faded:[-webkit-mask-image:none]",
        )}
      >
        {displayValue}
      </span>
      <span className="invisible block whitespace-nowrap">{spacerValue}</span>
    </span>
  );
}

export function TemplatesClient({ regionId, projectId }: TemplatesClientProps) {
  const { data, isRefetching, refetch } = useSuspenseQuery(
    clusterTemplatesQueryOptions(regionId, projectId),
  );
  const { data: images = [] } = useQuery(
    imagesQueryOptions(regionId, projectId),
  );
  const { data: flavors = [] } = useQuery(
    flavorsQueryOptions(regionId, projectId),
  );
  const [editingTemplate, setEditingTemplate] =
    useState<MagnumClusterTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] =
    useState<MagnumClusterTemplate | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const deleteTemplate = () => {
    if (!deletingTemplate || !projectId || !regionId) return;
    startDeleteTransition(async () => {
      setDeleteError(null);
      const result = await deleteClusterTemplateAction(
        { projectId, regionId },
        deletingTemplate.uuid,
      );
      if (!result.ok) {
        setDeleteError(result.error.message);
        return;
      }
      setDeletingTemplate(null);
      await refetch();
    });
  };
  const imagesByReference = useMemo(() => {
    const references = new Map<string, Image>();
    for (const image of images) {
      references.set(image.id, image);
      if (image.name) references.set(image.name, image);
    }
    return references;
  }, [images]);
  const flavorsByReference = useMemo(() => {
    const references = new Map<string, Flavor>();
    for (const flavor of flavors) {
      references.set(flavor.id, flavor);
      if (flavor.name) references.set(flavor.name, flavor);
    }
    return references;
  }, [flavors]);
  const columns = useMemo<ColumnDef<MagnumClusterTemplate>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => (
          <Link
            className="block min-w-0 hover:underline focus-visible:underline"
            href={`/kubernetes/templates/${row.original.uuid}`}
          >
            <FadedTableText
              value={row.original.name || row.original.uuid}
              className="w-64"
            />
          </Link>
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "uuid",
        header: "UUID",
        enableHiding: false,
        cell: ({ row }) => (
          <IDCell
            isSelected={row.getIsSelected()}
            linkPath="/kubernetes/templates"
            value={row.original.uuid}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "image_id",
        header: "Image",
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => {
          const reference = row.original.image_id || "-";
          const image = imagesByReference.get(reference);
          const content = (
            <FadedTableText
              value={image?.name || reference}
              className="w-72"
            />
          );
          return image ? (
            <Link
              className="block min-w-0 hover:underline focus-visible:underline"
              href={`/compute/images/${image.id}`}
            >
              {content}
            </Link>
          ) : (
            content
          );
        },
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "os_distro",
        accessorFn: (template) =>
          magnumImageDistribution(
            imagesByReference.get(template.image_id || ""),
          ) || "-",
        header: "Distribution",
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
          magnumImageDistribution(
            imagesByReference.get(row.original.image_id || ""),
          ) || "-",
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "flavor_id",
        header: "Worker Node Flavor",
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => {
          const reference = row.original.flavor_id || "";
          const flavor = flavorsByReference.get(reference);
          const label = flavor?.name || reference || "-";
          return flavor ? (
            <Link
              className="hover:underline focus-visible:underline"
              href={`/compute/instance-flavors/${flavor.id}`}
            >
              {label}
            </Link>
          ) : (
            label
          );
        },
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "master_flavor_id",
        header: "Control Node Flavor",
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => {
          const reference = row.original.master_flavor_id || "";
          const flavor = flavorsByReference.get(reference);
          const label = flavor?.name || reference || "-";
          return flavor ? (
            <Link
              className="hover:underline focus-visible:underline"
              href={`/compute/instance-flavors/${flavor.id}`}
            >
              {label}
            </Link>
          ) : (
            label
          );
        },
        meta: { fieldType: "string", visible: false },
      },
      {
        accessorKey: "network_driver",
        header: "Network Driver",
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
          row.original.network_driver || "-",
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "public",
        header: "Visibility",
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => (
          <Badge variant={row.original.public ? "default" : "secondary"}>
            {row.original.public ? "Public" : "Private"}
          </Badge>
        ),
        meta: { fieldType: "boolean", visible: true },
      },
      {
        accessorKey: "floating_ip_enabled",
        header: "Floating IP",
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
          row.original.floating_ip_enabled ? "Enabled" : "Disabled",
        meta: { fieldType: "boolean", visible: true },
      },
      {
        accessorKey: "created_at",
        header: "Age",
        meta: { fieldType: "date", dateDisplay: "age", visible: false },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
          row.original.project_id === projectId ? (
            <div className="flex items-center justify-end gap-1">
              <Button
                aria-label={`Edit ${row.original.name}`}
                onClick={() => setEditingTemplate(row.original)}
                size="icon"
                variant="ghost"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                aria-label={`Delete ${row.original.name}`}
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setDeleteError(null);
                  setDeletingTemplate(row.original);
                }}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null,
        meta: { visible: true },
      },
    ],
    [flavorsByReference, imagesByReference, projectId],
  );
  const publicTemplates = data.filter((template) => template.public).length;
  const privateTemplates = data.length - publicTemplates;
  const networkDrivers = uniqueValues(
    data,
    (template) => template.network_driver,
  );
  const floatingIpTemplates = data.filter(
    (template) => template.floating_ip_enabled,
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryTile
          icon={Settings}
          label="Templates"
          value={String(data.length)}
          detail={`${publicTemplates} public / ${privateTemplates} private`}
        />
        <SummaryTile
          icon={Network}
          label="Network drivers"
          value={String(networkDrivers)}
          detail="Pod network drivers"
        />
        <SummaryTile
          icon={Cloud}
          label="Floating IP"
          value={String(floatingIpTemplates)}
          detail="Enabled external API access"
        />
      </div>

      <DataTable
        data={data}
        isRefetching={isRefetching}
        refetch={refetch}
        columns={columns}
        resourceName="cluster template"
        emptyIcon={Settings}
      />
      {editingTemplate ? (
        <ClusterTemplateMutationSheet
          key={editingTemplate.uuid}
          open
          projectId={projectId}
          regionId={regionId}
          template={editingTemplate}
          onOpenChange={(open) => !open && setEditingTemplate(null)}
          onComplete={async () => {
            setEditingTemplate(null);
            await refetch();
          }}
        />
      ) : null}
      {deletingTemplate ? (
        <MutationConfirmationDialog
          confirmLabel="Delete template"
          description="This permanently removes the reusable template. Existing clusters are not changed."
          error={deleteError}
          onConfirm={deleteTemplate}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteError(null);
              setDeletingTemplate(null);
            }
          }}
          open
          pending={isDeleting}
          pendingLabel="Deleting"
          title={`Delete ${deletingTemplate.name || "cluster template"}?`}
          variant="destructive"
        />
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  Container,
  FolderTree,
  Gauge,
  HardDrive,
  Network,
  Search,
  Server,
  Waypoints,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  OverviewService,
  OverviewServiceId,
} from "@/lib/openstack/overview";
import { quotaPercentage, type QuotaLevel } from "@/lib/openstack/quota";
import {
  buildQuotaRows,
  filterQuotaRows,
  isAttentionLevel,
  type QuotaStatusFilter,
} from "@/lib/openstack/quota-view";

const serviceDetails = {
  compute: {
    icon: Server,
    description:
      "Nova limits the instances, VCPUs, and RAM available to this project.",
  },
  storage: {
    icon: HardDrive,
    description:
      "Cinder limits volumes, snapshots, and provisioned block-storage capacity.",
  },
  network: {
    icon: Network,
    description:
      "Neutron reports network resources and reservations exposed by enabled extensions.",
  },
  "shared-file-system": {
    icon: FolderTree,
    description:
      "Manila limits shares, snapshots, networks, and their provisioned capacity.",
  },
  "container-infra": {
    icon: Container,
    description:
      "Magnum limits the Kubernetes clusters that can run in this project.",
  },
  "load-balancing": {
    icon: Waypoints,
    description:
      "Octavia limits logical load balancers and their configuration in this project.",
  },
} satisfies Record<
  OverviewServiceId,
  { icon: typeof Server; description: string }
>;

const statusOptions: Array<{ value: QuotaStatusFilter; label: string }> = [
  { value: "all", label: "All states" },
  { value: "attention", label: "Needs attention" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "normal", label: "Within limit" },
  { value: "unlimited", label: "Unlimited" },
];

const serviceOptions: Array<{
  value: "all" | OverviewServiceId;
  label: string;
}> = [
  { value: "all", label: "All services" },
  { value: "compute", label: "Compute" },
  { value: "storage", label: "Block storage" },
  { value: "network", label: "Network" },
  { value: "shared-file-system", label: "Shared file systems" },
  { value: "container-infra", label: "Kubernetes" },
  { value: "load-balancing", label: "Load balancing" },
];

const levelLabels: Record<QuotaLevel, string> = {
  normal: "Within limit",
  warning: "Warning",
  critical: "Critical",
  unlimited: "Unlimited",
};

function formatValue(value: number, unit?: string) {
  const formatted = new Intl.NumberFormat("en", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function LevelBadge({ level }: { level: QuotaLevel }) {
  return (
    <Badge
      variant={level === "critical" ? "destructive" : "outline"}
      className={cn(
        level === "warning" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        level === "unlimited" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {levelLabels[level]}
    </Badge>
  );
}

function ServiceAvailability({ service }: { service: OverviewService }) {
  const detail = serviceDetails[service.id];
  const Icon = detail.icon;
  const available = service.status === "available";

  return (
    <div className="min-w-0 rounded-md border bg-card/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium">{service.label}</h3>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {available
                ? `${service.metrics.length} ${service.metrics.length === 1 ? "quota" : "quotas"} reported`
                : service.message}
            </div>
          </div>
        </div>
        <Badge variant={available ? "secondary" : "outline"}>
          {available ? "Available" : "Unavailable"}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {detail.description}
      </p>
    </div>
  );
}

export function QuotaExplorer({ services }: { services: OverviewService[] }) {
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<"all" | OverviewServiceId>(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<QuotaStatusFilter>("all");
  const rows = useMemo(() => buildQuotaRows(services), [services]);
  const filteredRows = useMemo(
    () =>
      filterQuotaRows(rows, {
        query,
        service: serviceFilter,
        status: statusFilter,
      }),
    [query, rows, serviceFilter, statusFilter],
  );
  const attentionCount = rows.filter((row) =>
    isAttentionLevel(row.level),
  ).length;
  const activeFilters =
    query.trim() !== "" || serviceFilter !== "all" || statusFilter !== "all";
  const statusLabel =
    statusOptions.find((option) => option.value === statusFilter)?.label ??
    "All states";
  const serviceLabel =
    serviceOptions.find((option) => option.value === serviceFilter)?.label ??
    "All services";

  const clearFilters = () => {
    setQuery("");
    setServiceFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="space-y-9">
      <section aria-labelledby="quota-services-heading" className="space-y-3">
        <div>
          <h2 id="quota-services-heading" className="text-sm font-semibold">
            Reporting services
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quota availability follows the OpenStack services enabled in this
            region and your current permissions.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <ServiceAvailability key={service.id} service={service} />
          ))}
        </div>
      </section>

      <section aria-labelledby="quota-table-heading" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="quota-table-heading" className="text-sm font-semibold">
              Project quotas
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredRows.length} of {rows.length} quotas shown
            </p>
          </div>
          {attentionCount > 0 ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            >
              <CircleAlert />
              {attentionCount} need attention
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-y bg-muted/20 p-3 lg:flex-row lg:items-center">
          <InputGroup className="w-full bg-background lg:max-w-xs">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search quotas"
              aria-label="Search quotas"
            />
          </InputGroup>

          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-w-40 justify-between">
                  <span>{serviceLabel}</span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                <DropdownMenuLabel>Service</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={serviceFilter}
                  onValueChange={(value) =>
                    setServiceFilter(value as "all" | OverviewServiceId)
                  }
                >
                  {serviceOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="hidden min-w-0 overflow-x-auto sm:block">
            <Tabs
              value={serviceFilter}
              onValueChange={(value) =>
                setServiceFilter(value as "all" | OverviewServiceId)
              }
            >
              <TabsList className="w-max">
                <TabsTrigger value="all">All services</TabsTrigger>
                <TabsTrigger value="compute">Compute</TabsTrigger>
                <TabsTrigger value="storage">Block storage</TabsTrigger>
                <TabsTrigger value="network">Network</TabsTrigger>
                <TabsTrigger value="shared-file-system">
                  Shared file systems
                </TabsTrigger>
                <TabsTrigger value="container-infra">Kubernetes</TabsTrigger>
                <TabsTrigger value="load-balancing">Load balancing</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-w-40 justify-between">
                  <span>{statusLabel}</span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuLabel>Quota state</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as QuotaStatusFilter)
                  }
                >
                  {statusOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {activeFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearFilters}
                aria-label="Clear quota filters"
                title="Clear quota filters"
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div>

        {filteredRows.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Resource</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead>Effective usage</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const percentage = quotaPercentage(row);
                  const consumed = row.used + row.reserved;
                  const limit =
                    row.limit < 0
                      ? "Unlimited"
                      : formatValue(row.limit, row.unit);

                  return (
                    <TableRow key={`${row.serviceId}-${row.id}`}>
                      <TableCell>
                        <Link
                          href={row.href}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.label}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.serviceLabel}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatValue(row.used, row.unit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.reserved > 0
                          ? formatValue(row.reserved, row.unit)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="w-52">
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="font-medium tabular-nums">
                              {formatValue(consumed, row.unit)}
                            </span>
                            <span className="text-muted-foreground">
                              {limit}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "mt-2 h-1.5 overflow-hidden rounded-full bg-muted",
                              row.level === "unlimited" &&
                                "border-y border-dashed border-emerald-500/50 bg-emerald-500/5",
                            )}
                            role={
                              percentage === null ? undefined : "progressbar"
                            }
                            aria-label={`${row.label} effective quota usage`}
                            aria-valuemin={percentage === null ? undefined : 0}
                            aria-valuemax={
                              percentage === null ? undefined : 100
                            }
                            aria-valuenow={
                              percentage === null
                                ? undefined
                                : Math.round(percentage)
                            }
                          >
                            <div
                              className={cn(
                                "h-full rounded-full",
                                row.level === "normal" && "bg-sky-500",
                                row.level === "warning" && "bg-amber-500",
                                row.level === "critical" && "bg-rose-600",
                                row.level === "unlimited" && "bg-emerald-500",
                              )}
                              style={{ width: `${percentage ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <LevelBadge level={row.level} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty className="min-h-72 rounded-md border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Gauge />
              </EmptyMedia>
              <EmptyTitle>No matching quotas</EmptyTitle>
              <EmptyDescription>
                {rows.length === 0
                  ? "No quota metrics are available for the current project and region."
                  : "No quotas match the current search and filters."}
              </EmptyDescription>
            </EmptyHeader>
            {activeFilters ? (
              <EmptyContent>
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </section>
    </div>
  );
}

import type { ReactNode } from "react";
import {
  CircleCheck,
  CircleHelp,
  CircleX,
  FolderKanban,
  MapPin,
} from "lucide-react";
import type { CloudContextSnapshot } from "@/lib/cloud-context-snapshot";
import type { ServiceDirectoryId } from "@/lib/openstack/service-directory";
import { cn } from "@/lib/utils";

export function ProjectContextHeader({
  title,
  description,
  context,
  serviceId,
  actions,
}: {
  title: string;
  description?: string;
  context: CloudContextSnapshot;
  serviceId?: ServiceDirectoryId;
  actions?: ReactNode;
}) {
  const service = serviceId
    ? context.services.find((item) => item.id === serviceId)
    : undefined;
  const ServiceStatusIcon =
    service?.status === "available"
      ? CircleCheck
      : service?.status === "unavailable"
        ? CircleX
        : CircleHelp;

  return (
    <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <FolderKanban className="size-4 shrink-0" />
            <span className="truncate font-medium text-foreground">
              {context.project.name}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" />
            {context.region.name}
          </span>
          {service ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                service.status === "available" &&
                  "text-emerald-700 dark:text-emerald-400",
                service.status === "unavailable" &&
                  "text-rose-700 dark:text-rose-400",
              )}
              title={service.message}
            >
              <ServiceStatusIcon className="size-4" aria-hidden="true" />
              {service.status === "available"
                ? "Service available"
                : service.status === "unavailable"
                  ? "Service unavailable"
                  : "Availability unknown"}
            </span>
          ) : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

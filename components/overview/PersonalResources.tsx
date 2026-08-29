"use client";

import Link from "next/link";
import { useState, useTransition, type ComponentType } from "react";
import {
  Container,
  Database,
  HardDrive,
  ImageIcon,
  Pin,
  PinOff,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  resourceKindLabel,
  resourcePreferenceHref,
  type ResourceKind,
  type ResourcePreference,
} from "@/lib/resource-preferences";

const resourceIcons: Record<
  ResourceKind,
  ComponentType<{ className?: string }>
> = {
  instance: Server,
  volume: HardDrive,
  image: ImageIcon,
  cluster: Container,
  bucket: Database,
};

function ResourceList({
  resources,
  pinned,
  pending,
  onTogglePin,
}: {
  resources: ResourcePreference[];
  pinned: boolean;
  pending: boolean;
  onTogglePin: (resource: ResourcePreference) => void;
}) {
  if (resources.length === 0) {
    return (
      <div className="border-y px-2 py-5 text-sm text-muted-foreground">
        {pinned ? "No pinned resources" : "No recently viewed resources"}
      </div>
    );
  }

  return (
    <ul className="divide-y border-y">
      {resources.map((resource) => {
        const Icon = resourceIcons[resource.kind];
        const action = pinned ? "Unpin" : "Pin";
        return (
          <li
            key={`${resource.kind}:${resource.id}`}
            className="flex min-h-14 items-center gap-3 px-2 py-2"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={resourcePreferenceHref(resource)}
                className="block truncate text-sm font-medium hover:underline"
              >
                {resource.name}
              </Link>
              <div className="truncate text-xs text-muted-foreground">
                {resourceKindLabel(resource.kind)}
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  aria-label={`${action} ${resource.name}`}
                  onClick={() => onTogglePin(resource)}
                >
                  {pinned ? (
                    <PinOff className="size-4" />
                  ) : (
                    <Pin className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

export function PersonalResources({
  initialPinned,
  initialRecent,
}: {
  initialPinned: ResourcePreference[];
  initialRecent: ResourcePreference[];
}) {
  const [resources, setResources] = useState({
    pinned: initialPinned,
    recent: initialRecent,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const togglePin = (resource: ResourcePreference) => {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch("/api/preferences/resources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "toggle-pin", resource }),
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Preference update failed");

        const next = (await response.json()) as {
          pinned: ResourcePreference[];
          recent: ResourcePreference[];
        };
        setResources(next);
      } catch {
        setError("Pinned resources could not be updated.");
      }
    });
  };

  return (
    <section aria-labelledby="personal-resources-heading" className="space-y-3">
      <h2 id="personal-resources-heading" className="text-sm font-semibold">
        Your resources
      </h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Pinned
          </h3>
          <ResourceList
            resources={resources.pinned}
            pinned
            pending={isPending}
            onTogglePin={togglePin}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Recent
          </h3>
          <ResourceList
            resources={resources.recent}
            pinned={false}
            pending={isPending}
            onTogglePin={togglePin}
          />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}

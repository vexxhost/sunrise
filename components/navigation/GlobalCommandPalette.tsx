"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Container,
  Database,
  FolderTree,
  Gauge,
  Globe,
  HardDrive,
  Home,
  ImageIcon,
  Layers,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { GLOBAL_SEARCH_EVENT } from "@/components/navigation/global-search-events";
import {
  excludeKnownGlobalSearchResources,
  globalSearchResourceDescription,
  resourcePreferenceToSearchResource,
  type GlobalSearchResource,
} from "@/lib/global-search";
import { loadGlobalSearchIndex } from "@/lib/global-search-actions";
import type {
  ServiceDirectoryId,
  ServiceDirectoryItem,
} from "@/lib/openstack/service-directory";
import type {
  ResourceKind,
  ResourcePreference,
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

const serviceIcons: Record<
  ServiceDirectoryId,
  ComponentType<{ className?: string }>
> = {
  compute: Server,
  kubernetes: Container,
  "object-storage": Database,
  orchestration: Layers,
  dns: Globe,
  "file-system": FolderTree,
};

function ResourceItem({
  resource,
  onSelect,
}: {
  resource: GlobalSearchResource;
  onSelect: (href: string) => void;
}) {
  const Icon = resourceIcons[resource.kind];
  return (
    <CommandItem
      value={`${resource.name} ${resource.kind} ${resource.id} ${resource.status ?? ""}`}
      onSelect={() => onSelect(resource.href)}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{resource.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {globalSearchResourceDescription(resource)}
        </span>
      </span>
    </CommandItem>
  );
}

export function GlobalCommandPalette({
  services,
  pinnedResources,
  recentResources,
  regionId,
  projectId,
}: {
  services: ServiceDirectoryItem[];
  pinnedResources: ResourcePreference[];
  recentResources: ResourcePreference[];
  regionId?: string;
  projectId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const hasContext = Boolean(regionId && projectId);
  const searchIndex = useQuery({
    queryKey: ["global-search-index", regionId, projectId],
    queryFn: loadGlobalSearchIndex,
    enabled: open && hasContext,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    function handleOpenSearch() {
      setOpen(true);
    }

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener(GLOBAL_SEARCH_EVENT, handleOpenSearch);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(GLOBAL_SEARCH_EVENT, handleOpenSearch);
    };
  }, []);

  const pinned = useMemo(
    () => pinnedResources.map(resourcePreferenceToSearchResource),
    [pinnedResources],
  );
  const recent = useMemo(
    () => recentResources.map(resourcePreferenceToSearchResource),
    [recentResources],
  );
  const fetchedResources = excludeKnownGlobalSearchResources(
    searchIndex.data?.resources ?? [],
    [...pinned, ...recent],
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setSearch("");
  }

  function navigate(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  function refresh() {
    handleOpenChange(false);
    void queryClient.invalidateQueries();
    router.refresh();
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-full max-w-md justify-start gap-2 px-3 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Search Sunrise (Control or Command K)"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="truncate">Search resources and services</span>
        <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Search Sunrise"
        description="Search resources and services, or run a common action."
        className="sm:max-w-2xl"
      >
        <CommandInput
          placeholder="Search resources, services, and actions..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="max-h-[min(65vh,30rem)]">
          <CommandEmpty>
            No matching resources, services, or actions.
          </CommandEmpty>

          <CommandGroup heading="Actions">
            <CommandItem
              value="overview home dashboard"
              onSelect={() => navigate("/")}
            >
              <Home aria-hidden="true" />
              <span>Go to overview</span>
            </CommandItem>
            <CommandItem
              value="quotas limits usage"
              onSelect={() => navigate("/quotas")}
            >
              <Gauge aria-hidden="true" />
              <span>View quotas</span>
            </CommandItem>
            <CommandItem value="refresh reload current page" onSelect={refresh}>
              <RefreshCw aria-hidden="true" />
              <span>Refresh current page</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Services">
            {services.map((service) => {
              const Icon = serviceIcons[service.id];
              const unavailable = service.status === "unavailable";
              return (
                <CommandItem
                  key={service.id}
                  value={`${service.label} ${service.description}`}
                  disabled={unavailable}
                  onSelect={() => navigate(service.href)}
                >
                  <Icon aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{service.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {unavailable ? service.message : service.description}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          {pinned.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Pinned resources">
                {pinned.map((resource) => (
                  <ResourceItem
                    key={`${resource.kind}:${resource.id}`}
                    resource={resource}
                    onSelect={navigate}
                  />
                ))}
              </CommandGroup>
            </>
          )}

          {recent.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent resources">
                {recent.map((resource) => (
                  <ResourceItem
                    key={`${resource.kind}:${resource.id}`}
                    resource={resource}
                    onSelect={navigate}
                  />
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Resources">
            {searchIndex.isFetching && (
              <CommandItem forceMount disabled value="loading resources">
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                <span>Loading resources in the active project...</span>
              </CommandItem>
            )}
            {!searchIndex.isFetching &&
              fetchedResources.map((resource) => (
                <ResourceItem
                  key={`${resource.kind}:${resource.id}`}
                  resource={resource}
                  onSelect={navigate}
                />
              ))}
          </CommandGroup>

          {(searchIndex.isError ||
            (searchIndex.data?.unavailableSources.length ?? 0) > 0) && (
            <div
              className="border-t px-4 py-2 text-xs text-muted-foreground"
              role="status"
            >
              {searchIndex.isError
                ? "Resource search is temporarily unavailable."
                : `Some sources are unavailable: ${searchIndex.data?.unavailableSources.join(", ")}.`}
            </div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

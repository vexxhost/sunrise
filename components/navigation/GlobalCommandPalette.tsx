"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentType,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cable,
  Camera,
  Container,
  Cpu,
  Database,
  FolderTree,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  Home,
  ImageIcon,
  Layers,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Route,
  Search,
  Server,
  Share2,
  Shield,
  Star,
  Vault,
  Warehouse,
  Package,
  ScrollText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCloudContext } from "@/components/cloud/CloudContext";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { createActionIcons } from "@/components/resources/CreateResourceMenu";
import {
  excludeKnownGlobalSearchResources,
  globalSearchResourceDescription,
  globalSearchResourceValue,
  resourcePreferenceToSearchResource,
  type GlobalSearchResource,
} from "@/lib/global-search";
import { loadGlobalSearchIndex } from "@/lib/global-search-actions";
import {
  commandPaletteFilter,
  createActionSearchTerms,
  serviceDirectorySearchTerms,
  type NavigationDestination,
  type NavigationDestinationIcon,
  type NavigationDestinationId,
} from "@/lib/navigation-destinations";
import type { ServiceDirectoryId } from "@/lib/openstack/service-directory";
import type { ResourceKind } from "@/lib/resource-preferences";
import { cn } from "@/lib/utils";

const resourceIcons: Record<
  ResourceKind,
  ComponentType<{ className?: string }>
> = {
  instance: Server,
  volume: HardDrive,
  image: ImageIcon,
  cluster: Container,
  bucket: Database,
  share: FolderTree,
  secret: Vault,
  "secret-container": Package,
  "secret-order": ScrollText,
};

const serviceIcons: Record<
  ServiceDirectoryId,
  ComponentType<{ className?: string }>
> = {
  compute: Server,
  kubernetes: Container,
  "object-storage": Database,
  identity: KeyRound,
  orchestration: Layers,
  dns: Globe,
  "shared-file-system": FolderTree,
  "key-manager": Vault,
};

const destinationIcons: Record<
  NavigationDestinationIcon,
  ComponentType<{ className?: string }>
> = {
  "application-credential": KeyRound,
  bucket: Database,
  cluster: Container,
  "cluster-template": Layers,
  container: Package,
  flavor: Cpu,
  "floating-ip": Globe,
  image: ImageIcon,
  instance: Server,
  "key-pair": KeyRound,
  network: GitBranch,
  order: ScrollText,
  port: Cable,
  role: KeyRound,
  router: Route,
  secret: Vault,
  "secret-store": Warehouse,
  "security-group": Shield,
  share: FolderTree,
  "share-network": Share2,
  snapshot: Camera,
  topology: GitBranch,
  volume: HardDrive,
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
      value={globalSearchResourceValue(resource)}
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

function DestinationItem({
  destination,
  favorite,
  favoritePending,
  onSelect,
  onToggleFavorite,
}: {
  destination: NavigationDestination;
  favorite: boolean;
  favoritePending: boolean;
  onSelect: (href: string) => void;
  onToggleFavorite: (id: NavigationDestinationId) => void;
}) {
  const Icon = destinationIcons[destination.icon];
  const unavailable = destination.status === "unavailable";
  const favoriteLabel = favorite
    ? `Remove ${destination.label} from favorites`
    : `Add ${destination.label} to favorites`;

  return (
    <CommandItem
      value={`${destination.label} ${destination.description} ${destination.group} ${destination.keywords.join(" ")}`}
      aria-disabled={unavailable}
      className={cn(unavailable && "opacity-50")}
      onSelect={() => !unavailable && onSelect(destination.href)}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{destination.label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {unavailable ? destination.message : destination.description}
        </span>
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-my-2 -mr-1"
            disabled={favoritePending}
            aria-label={favoriteLabel}
            aria-pressed={favorite}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFavorite(destination.id);
            }}
          >
            <Star
              className={cn("size-4", favorite && "fill-current text-primary")}
              aria-hidden="true"
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{favoriteLabel}</TooltipContent>
      </Tooltip>
    </CommandItem>
  );
}

export function GlobalCommandPalette() {
  const {
    services,
    destinations,
    favoriteDestinations: initialFavoriteDestinations,
    personalResources: { pinned: pinnedResources, recent: recentResources },
    createActions,
    region,
    project,
  } = useCloudContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favoriteDestinations, setFavoriteDestinations] = useState(
    initialFavoriteDestinations,
  );
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [favoritePending, startFavoriteTransition] = useTransition();
  const regionId = region.id ?? undefined;
  const projectId = project.id ?? undefined;
  const hasContext = Boolean(regionId && projectId);
  const searchIndex = useQuery({
    queryKey: ["global-search-index", regionId, projectId],
    queryFn: () => loadGlobalSearchIndex(),
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
  const favoriteDestinationSet = useMemo(
    () => new Set(favoriteDestinations),
    [favoriteDestinations],
  );
  const favoriteDestinationItems = useMemo(
    () =>
      favoriteDestinations
        .map((id) => destinations.find((destination) => destination.id === id))
        .filter((destination): destination is NavigationDestination =>
          Boolean(destination),
        ),
    [destinations, favoriteDestinations],
  );
  const otherDestinations = useMemo(
    () => destinations.filter(({ id }) => !favoriteDestinationSet.has(id)),
    [destinations, favoriteDestinationSet],
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

  function toggleFavorite(destinationId: NavigationDestinationId) {
    startFavoriteTransition(async () => {
      setFavoriteError(null);
      try {
        const response = await fetch("/api/preferences/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinationId }),
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Favorite update failed");

        const next = (await response.json()) as {
          favoriteDestinations: NavigationDestinationId[];
        };
        setFavoriteDestinations(next.favoriteDestinations);
      } catch {
        setFavoriteError("Favorites could not be updated.");
      }
    });
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
        className="sm:max-w-3xl"
        filter={commandPaletteFilter}
      >
        <CommandInput
          placeholder="Search pages, resources, services, and actions..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="max-h-[min(65vh,30rem)]">
          <CommandEmpty>
            No matching pages, resources, services, or actions.
          </CommandEmpty>

          {favoriteDestinationItems.length > 0 && (
            <>
              <CommandGroup heading="Favorite pages">
                {favoriteDestinationItems.map((destination) => (
                  <DestinationItem
                    key={destination.id}
                    destination={destination}
                    favorite
                    favoritePending={favoritePending}
                    onSelect={navigate}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

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
          <CommandGroup heading="Pages">
            {otherDestinations.map((destination) => (
              <DestinationItem
                key={destination.id}
                destination={destination}
                favorite={false}
                favoritePending={favoritePending}
                onSelect={navigate}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Create resources">
            {createActions.map((action) => {
              const Icon = createActionIcons[action.id];
              const available = action.capability.status === "available";
              return (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.description} ${action.group} ${createActionSearchTerms[action.id].join(" ")}`}
                  disabled={!available}
                  onSelect={() => available && navigate(action.href)}
                >
                  <Icon aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{action.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {available
                        ? action.description
                        : action.capability.message}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Services">
            {services.map((service) => {
              const Icon = serviceIcons[service.id];
              const unavailable = service.status === "unavailable";
              return (
                <CommandItem
                  key={service.id}
                  value={`${service.label} ${service.description} ${serviceDirectorySearchTerms[service.id].join(" ")}`}
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
            favoriteError ||
            (searchIndex.data?.unavailableSources.length ?? 0) > 0) && (
            <div
              className="border-t px-4 py-2 text-xs text-muted-foreground"
              role="status"
            >
              {favoriteError ??
                (searchIndex.isError
                  ? "Resource search is temporarily unavailable."
                  : `Some sources are unavailable: ${searchIndex.data?.unavailableSources.join(", ")}.`)}
            </div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

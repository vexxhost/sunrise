"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleStop,
  MoreHorizontal,
  Monitor,
  Pencil,
  Play,
  RefreshCw,
  RotateCw,
  Trash2,
  Zap,
} from "lucide-react";

import {
  InstanceLifecycleDialog,
  type InstanceMutationKind,
} from "@/components/Instance/InstanceLifecycleDialog";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { keypairsQueryOptions } from "@/hooks/queries/useServers";
import {
  rebuildServerAction,
  replaceServerMetadataAction,
} from "@/lib/openstack/nova-actions";
import {
  canDeleteServer,
  canRebuildServer,
  canRunServerLifecycleAction,
  isServerTransitioning,
} from "@/lib/openstack/server-lifecycle";
import type { Server } from "@/types/openstack";

type MetadataEntry = { id: number; key: string; value: string };

interface InstanceDetailActionsProps {
  projectId?: string;
  regionId?: string;
  server: Server;
}

export function InstanceDetailActions({
  projectId,
  regionId,
  server,
}: InstanceDetailActionsProps) {
  const queryClient = useQueryClient();
  const [lifecycleAction, setLifecycleAction] = useState<InstanceMutationKind | null>(null);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [imageRef, setImageRef] = useState("");
  const [keyName, setKeyName] = useState("preserve");
  const [preserveEphemeral, setPreserveEphemeral] = useState(false);
  const [metadata, setMetadata] = useState<MetadataEntry[]>([]);
  const [nextMetadataId, setNextMetadataId] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: images = [], isFetching: imagesLoading } = useQuery({
    ...imagesQueryOptions(regionId, projectId),
    enabled: rebuildOpen && Boolean(regionId),
  });
  const { data: keypairs = [] } = useQuery({
    ...keypairsQueryOptions(regionId, projectId),
    enabled: rebuildOpen && Boolean(regionId),
  });

  const openRebuildDialog = () => {
    const currentImage =
      server.image && typeof server.image === "object" ? server.image.id : "";
    setImageRef(currentImage);
    setKeyName("preserve");
    setPreserveEphemeral(false);
    setError(null);
    setRebuildOpen(true);
  };

  const openMetadataDialog = () => {
    const entries = Object.entries(server.metadata ?? {}).map(([key, value], index) => ({
      id: index + 1,
      key,
      value,
    }));
    setMetadata(entries);
    setNextMetadataId(entries.length + 1);
    setError(null);
    setMetadataOpen(true);
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "server", server.id],
      }),
      queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "servers"],
      }),
      queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "server-actions", server.id],
      }),
    ]);
  };

  const primaryAction = useMemo(() => {
    if (canRunServerLifecycleAction(server, "start")) {
      return { kind: "start" as const, label: "Start", icon: Play };
    }
    if (canRunServerLifecycleAction(server, "stop")) {
      return { kind: "stop" as const, label: "Stop", icon: CircleStop };
    }
    return null;
  }, [server]);

  const saveMetadata = () => {
    if (!projectId || !regionId) return;
    const duplicateKeys = metadata
      .map(({ key }) => key.trim())
      .filter((key, index, values) => key && values.indexOf(key) !== index);
    if (duplicateKeys.length) {
      setError(`Metadata key ${duplicateKeys[0]} is duplicated.`);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await replaceServerMetadataAction(
        { projectId, regionId },
        server.id,
        Object.fromEntries(
          metadata
            .map(({ key, value }) => [key.trim(), value] as const)
            .filter(([key]) => key),
        ),
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await refresh();
      setMetadataOpen(false);
    });
  };

  const rebuild = () => {
    if (!projectId || !regionId || !imageRef) return;
    startTransition(async () => {
      setError(null);
      const result = await rebuildServerAction(
        { projectId, regionId },
        server.id,
        {
          imageRef,
          keyName: keyName === "preserve" ? undefined : keyName === "none" ? null : keyName,
          preserveEphemeral,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await refresh();
      setRebuildOpen(false);
    });
  };

  const transitioning = isServerTransitioning(server);
  const PrimaryIcon = primaryAction?.icon;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="h-10 gap-2">
          <Link href={`/compute/instances/${encodeURIComponent(server.id)}/console`}>
            <Monitor className="size-4" />
            Connect
          </Link>
        </Button>
        <ButtonGroup>
          <Button
            type="button"
            variant="outline"
            className="size-10 gap-2 sm:w-auto sm:px-4"
            aria-label="Refresh instance"
            onClick={() => void refresh()}
          >
            <RefreshCw className="size-4" />
            <span className="sr-only sm:not-sr-only">Refresh</span>
          </Button>
          {primaryAction && PrimaryIcon ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2"
              onClick={() => setLifecycleAction(primaryAction.kind)}
            >
              <PrimaryIcon className="size-4" />
              {primaryAction.label}
            </Button>
          ) : null}
        </ButtonGroup>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-10" aria-label="Instance actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Power
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!canRunServerLifecycleAction(server, "soft-reboot")}
              onClick={() => setLifecycleAction("soft-reboot")}
            >
              <RotateCw className="size-4" />
              Reboot
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canRunServerLifecycleAction(server, "hard-reboot")}
              onClick={() => setLifecycleAction("hard-reboot")}
            >
              <Zap className="size-4" />
              Force reboot
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Configuration
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!canRebuildServer(server)}
              onClick={openRebuildDialog}
            >
              <RefreshCw className="size-4" />
              Rebuild
            </DropdownMenuItem>
            <DropdownMenuItem disabled={transitioning} onClick={openMetadataDialog}>
              <Pencil className="size-4" />
              Edit metadata
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Danger zone
            </DropdownMenuLabel>
            <DropdownMenuItem
              variant="destructive"
              disabled={!canDeleteServer(server)}
              onClick={() => setLifecycleAction("delete")}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <InstanceLifecycleDialog
        action={lifecycleAction}
        instances={[server]}
        onComplete={refresh}
        onOpenChange={(open) => {
          if (!open) setLifecycleAction(null);
        }}
        projectId={projectId}
        regionId={regionId}
      />

      <Dialog open={metadataOpen} onOpenChange={setMetadataOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit metadata</DialogTitle>
            <DialogDescription>
              Replace the metadata exposed to the instance metadata service.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {metadata.map((entry) => (
              <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  aria-label="Metadata key"
                  maxLength={255}
                  placeholder="Key"
                  value={entry.key}
                  onChange={(event) =>
                    setMetadata((current) =>
                      current.map((item) =>
                        item.id === entry.id ? { ...item, key: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  aria-label="Metadata value"
                  maxLength={255}
                  placeholder="Value"
                  value={entry.value}
                  onChange={(event) =>
                    setMetadata((current) =>
                      current.map((item) =>
                        item.id === entry.id ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove metadata"
                  onClick={() =>
                    setMetadata((current) => current.filter((item) => item.id !== entry.id))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMetadata((current) => [
                  ...current,
                  { id: nextMetadataId, key: "", value: "" },
                ]);
                setNextMetadataId((value) => value + 1);
              }}
            >
              Add metadata
            </Button>
          </div>
          {error ? <MutationAlert>{error}</MutationAlert> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetadataOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={saveMetadata} disabled={isPending}>
              {isPending ? "Saving" : "Save metadata"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rebuildOpen} onOpenChange={setRebuildOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rebuild instance</DialogTitle>
            <DialogDescription>
              Rebuild replaces the root disk. Data on the root disk will be lost.
            </DialogDescription>
          </DialogHeader>
          <MutationAlert variant="warning" title="Destructive operation">
            Volume-backed instances can only use rebuild combinations supported by the
            cloud&apos;s Nova microversion and storage backend.
          </MutationAlert>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rebuild-image">Image</Label>
              <Select value={imageRef} onValueChange={setImageRef} disabled={imagesLoading || isPending}>
                <SelectTrigger id="rebuild-image">
                  <SelectValue placeholder={imagesLoading ? "Loading images" : "Choose an image"} />
                </SelectTrigger>
                <SelectContent>
                  {images.map((image) => (
                    <SelectItem key={image.id} value={image.id}>
                      {image.name || image.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rebuild-key">Key pair</Label>
              <Select value={keyName} onValueChange={setKeyName} disabled={isPending}>
                <SelectTrigger id="rebuild-key"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preserve">Keep current key pair</SelectItem>
                  <SelectItem value="none">Remove key pair</SelectItem>
                  {keypairs.map((keypair) => (
                    <SelectItem key={keypair.name} value={keypair.name}>
                      {keypair.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={preserveEphemeral} onCheckedChange={(value) => setPreserveEphemeral(Boolean(value))} />
              Preserve ephemeral storage when the hypervisor supports it
            </label>
          </div>
          {error ? <MutationAlert>{error}</MutationAlert> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRebuildOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={rebuild} disabled={!imageRef || isPending}>
              <RefreshCw className="size-4" />
              {isPending ? "Rebuilding" : "Rebuild instance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

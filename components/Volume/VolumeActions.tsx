"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { volumeTypesQueryOptions } from "@/hooks/queries/useVolumes";
import { createVolumeAction } from "@/lib/openstack/cinder-actions";

interface VolumeActionsProps {
  regionId?: string;
  projectId?: string;
}

interface CreateVolumeFormState {
  name: string;
  description: string;
  size: string;
  volumeType: string;
  availabilityZone: string;
  metadata: string;
  multiattach: boolean;
  bootable: boolean;
}

const INITIAL_FORM_STATE: CreateVolumeFormState = {
  name: "",
  description: "",
  size: "1",
  volumeType: "",
  availabilityZone: "",
  metadata: "",
  multiattach: false,
  bootable: false,
};

export function VolumeActions({ regionId, projectId }: VolumeActionsProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formState, setFormState] = useState<CreateVolumeFormState>(INITIAL_FORM_STATE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const queryClient = useQueryClient();
  const {
    data: volumeTypes = [],
    isLoading: isVolumeTypesLoading,
    isError: isVolumeTypesError,
    error: volumeTypesError,
  } = useQuery({
    ...volumeTypesQueryOptions(regionId, projectId),
    suspense: false,
  });

  const parsedMetadata = useMemo(() => {
    if (!formState.metadata.trim()) {
      return undefined;
    }

    try {
      return JSON.parse(formState.metadata) as Record<string, string>;
    } catch {
      return null;
    }
  }, [formState.metadata]);

  const isMetadataValid = parsedMetadata !== null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isMetadataValid) {
      setError("Metadata must be valid JSON.");
      return;
    }

    const size = Number(formState.size);

    if (Number.isNaN(size) || size <= 0) {
      setError("Size must be a positive number.");
      return;
    }

    startTransition(async () => {
      setError(null);

      try {
        await createVolumeAction(
          {
            size,
            name: formState.name || undefined,
            description: formState.description || undefined,
            volume_type: formState.volumeType || undefined,
            availability_zone: formState.availabilityZone || undefined,
            metadata: parsedMetadata,
            multiattach: formState.multiattach,
            bootable: formState.bootable,
          },
          regionId,
        );

        await queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "volumes"],
        });

        setFormState(INITIAL_FORM_STATE);
        setIsCreateOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create volume.");
      }
    });
  };

  return (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <ButtonGroup>
          <Button variant="default" size="sm" className="gap-2 h-10">
            <Plus className="h-4 w-4" />
            Create Volume
          </Button>
        </ButtonGroup>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Volume</DialogTitle>
          <DialogDescription>
            Provision a new Cinder volume in the selected region and project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="volume-name">Name</Label>
            <Input
              id="volume-name"
              value={formState.name}
              onChange={(event) =>
                setFormState((state) => ({ ...state, name: event.target.value }))
              }
              placeholder="Optional volume name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="volume-description">Description</Label>
            <Textarea
              id="volume-description"
              value={formState.description}
              onChange={(event) =>
                setFormState((state) => ({ ...state, description: event.target.value }))
              }
              placeholder="Optional description"
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="volume-size">Size (GB)</Label>
              <Input
                id="volume-size"
                type="number"
                min={1}
                required
                value={formState.size}
                onChange={(event) =>
                  setFormState((state) => ({ ...state, size: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="volume-type">Volume Type</Label>
              <select
                id="volume-type"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formState.volumeType}
                onChange={(event) =>
                  setFormState((state) => ({ ...state, volumeType: event.target.value }))
                }
                disabled={isVolumeTypesLoading || isVolumeTypesError}
              >
                {isVolumeTypesLoading ? (
                  <option value="">Loading…</option>
                ) : (
                  <>
                    <option value="">Default</option>
                    {volumeTypes.map((type) => (
                      <option key={type.id} value={type.name}>
                        {type.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {isVolumeTypesError && (
                <p className="text-sm text-destructive">
                  {(volumeTypesError as Error)?.message ?? "Failed to load volume types."}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="availability-zone">Availability Zone</Label>
            <Input
              id="availability-zone"
              value={formState.availabilityZone}
              onChange={(event) =>
                setFormState((state) => ({ ...state, availabilityZone: event.target.value }))
              }
              placeholder="Optional (e.g., nova)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="metadata-json">Metadata (JSON)</Label>
            <Textarea
              id="metadata-json"
              value={formState.metadata}
              onChange={(event) =>
                setFormState((state) => ({ ...state, metadata: event.target.value }))
              }
              placeholder='e.g. {"environment":"dev"}'
              rows={4}
            />
            {!isMetadataValid && (
              <p className="text-sm text-destructive">
                Metadata must be valid JSON (key/value pairs).
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={formState.multiattach}
                onCheckedChange={(checked) =>
                  setFormState((state) => ({ ...state, multiattach: checked === true }))
                }
              />
              Enable multi-attach
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={formState.bootable}
                onCheckedChange={(checked) =>
                  setFormState((state) => ({ ...state, bootable: checked === true }))
                }
              />
              Mark as bootable
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="submit"
              disabled={isPending || !isMetadataValid}
              className="w-full sm:w-auto"
            >
              {isPending ? "Creating…" : "Create Volume"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


import { normalizeMutationProjectId } from "@/lib/mutations";
import {
  imageMatchesGlanceTagFilter,
  type GlanceTagFilter,
} from "@/lib/openstack/glance-tag-filters";
import type { Image } from "@/types/openstack";

const TRANSITION_STATUSES: Image["status"][] = [
  "queued",
  "saving",
  "uploading",
  "importing",
  "pending_delete",
];

export function isImageTransitioning(image: Image) {
  return TRANSITION_STATUSES.includes(image.status);
}

export function isProjectOwnedImage(image: Image, projectId?: string) {
  return (
    Boolean(image.owner) &&
    normalizeMutationProjectId(image.owner) ===
      normalizeMutationProjectId(projectId)
  );
}

export function canEditImage(image: Image, projectId?: string) {
  return (
    isProjectOwnedImage(image, projectId) &&
    image.status !== "deleted" &&
    image.status !== "pending_delete"
  );
}

export function canDeleteImage(image: Image, projectId?: string) {
  return canEditImage(image, projectId) && !image.protected;
}

export function mergeImageUpdates(
  current: Image[],
  updates: ReadonlyMap<string, Image>,
  tagFilter?: GlanceTagFilter,
) {
  let changed = false;
  const next: Image[] = [];

  for (const image of current) {
    const updated = updates.get(image.id) ?? image;
    if (
      tagFilter &&
      !imageMatchesGlanceTagFilter(updated.tags ?? [], tagFilter)
    ) {
      changed = true;
      continue;
    }

    changed = changed || updated !== image;
    next.push(updated);
  }

  return changed ? next : current;
}

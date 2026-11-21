import { describe, expect, it } from "vitest";

import {
  canDeleteImage,
  canEditImage,
  isImageTransitioning,
  isProjectOwnedImage,
  mergeImageUpdates,
} from "@/lib/openstack/image-lifecycle";
import type { Image } from "@/types/openstack";

function image(overrides: Partial<Image> = {}) {
  return {
    id: "image-a",
    owner: "projecta",
    status: "active",
    protected: false,
    ...overrides,
  } as Image;
}

describe("Glance lifecycle availability", () => {
  it("normalizes project IDs before granting owner actions", () => {
    expect(isProjectOwnedImage(image(), "project-a")).toBe(true);
    expect(canEditImage(image(), "project-a")).toBe(true);
    expect(canEditImage(image(), "project-b")).toBe(false);
  });

  it("blocks protected deletion and transitional terminal states", () => {
    expect(canDeleteImage(image({ protected: true }), "project-a")).toBe(false);
    expect(canDeleteImage(image(), "project-a")).toBe(true);
    expect(canEditImage(image({ status: "pending_delete" }), "project-a")).toBe(false);
    expect(isImageTransitioning(image({ status: "saving" }))).toBe(true);
  });
});

describe("Glance polling updates", () => {
  const first = image({ id: "image-a", tags: ["env:test", "team:api"] });
  const second = image({ id: "image-b", tags: ["env:test"] });

  it("preserves the list reference when poll data is unchanged", () => {
    const current = [first, second];

    expect(mergeImageUpdates(current, new Map([[first.id, first]]))).toBe(
      current,
    );
  });

  it("replaces changed images without disturbing other rows", () => {
    const current = [first, second];
    const updated = image({
      id: first.id,
      status: "active",
      tags: first.tags,
    });
    const result = mergeImageUpdates(
      current,
      new Map([[updated.id, updated]]),
    );

    expect(result).toEqual([updated, second]);
    expect(result[1]).toBe(second);
  });

  it("removes a polled image that no longer matches the active tag filter", () => {
    const updated = image({ id: first.id, tags: ["env:test"] });
    const result = mergeImageUpdates(
      [first, second],
      new Map([[updated.id, updated]]),
      { tags: ["env:test", "team:api"] },
    );

    expect(result).toEqual([]);
  });

  it("keeps matching polled images in a filtered result", () => {
    const updated = image({
      id: first.id,
      status: "saving",
      tags: ["team:api", "env:test"],
    });
    const result = mergeImageUpdates(
      [first],
      new Map([[updated.id, updated]]),
      { tags: ["env:test", "team:api"] },
    );

    expect(result).toEqual([updated]);
  });

  it("ignores updates for images outside the current result", () => {
    const current = [first];
    const other = image({ id: "image-c", tags: ["env:test"] });

    expect(mergeImageUpdates(current, new Map([[other.id, other]]))).toBe(
      current,
    );
  });
});

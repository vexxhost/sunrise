import { describe, expect, it } from "vitest";

import {
  canDeleteImage,
  canEditImage,
  isImageTransitioning,
  isProjectOwnedImage,
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

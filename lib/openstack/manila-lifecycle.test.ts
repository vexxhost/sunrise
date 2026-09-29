import { describe, expect, it } from "vitest";

import {
  canDeleteShare,
  canEditShare,
  canManageShareAccess,
  canResizeShare,
  formatManilaStatus,
  isShareTransitioning,
  shareStatusVariant,
} from "@/lib/openstack/manila-lifecycle";

describe("Manila share lifecycle", () => {
  it("formats Manila's underscored statuses", () => {
    expect(formatManilaStatus("extending_error")).toBe("Extending Error");
    expect(formatManilaStatus(undefined)).toBe("Unknown");
  });

  it("polls every non-terminal share state", () => {
    expect(isShareTransitioning({ status: "creating" })).toBe(true);
    expect(isShareTransitioning({ status: "shrinking" })).toBe(true);
    expect(isShareTransitioning({ status: "available" })).toBe(false);
    expect(isShareTransitioning({ status: "error" })).toBe(false);
    expect(isShareTransitioning({ status: "shrinking_error" })).toBe(false);
    expect(isShareTransitioning({ status: "extending_error" })).toBe(false);
  });

  it("limits mutable operations to available shares", () => {
    const available = { status: "available" };
    const creating = { status: "creating" };

    expect(canEditShare(available)).toBe(true);
    expect(canResizeShare(available)).toBe(true);
    expect(canManageShareAccess(available)).toBe(true);
    expect(canEditShare(creating)).toBe(false);
    expect(canResizeShare(creating)).toBe(false);
    expect(canManageShareAccess(creating)).toBe(false);
  });

  it("allows deletion only for Manila's deletable stable states", () => {
    expect(canDeleteShare({ status: "available" })).toBe(true);
    expect(canDeleteShare({ status: "error" })).toBe(true);
    expect(canDeleteShare({ status: "inactive" })).toBe(true);
    expect(canDeleteShare({ status: "deleting" })).toBe(false);
  });

  it("uses destructive styling for every error state", () => {
    expect(shareStatusVariant("error")).toBe("destructive");
    expect(shareStatusVariant("shrinking_error")).toBe("destructive");
    expect(shareStatusVariant("available")).toBe("default");
  });
});

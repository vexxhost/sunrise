import { describe, expect, it } from "vitest";
import {
  formatServerPowerState,
  formatServerStatus,
  formatServerTaskState,
  serverStatusBadgeVariant,
} from "@/lib/openstack/server-state";

describe("formatServerStatus", () => {
  it("maps a known status to its label", () => {
    expect(formatServerStatus("ACTIVE")).toBe("Active");
    expect(formatServerStatus("SHELVED_OFFLOADED")).toBe("Shelved Offloaded");
  });

  it("is case-insensitive for known statuses", () => {
    expect(formatServerStatus("active")).toBe("Active");
  });

  it("humanizes an unknown status", () => {
    expect(formatServerStatus("SOME_NEW_STATE")).toBe("Some New State");
  });

  it("returns 'Unknown' for empty or non-string input", () => {
    expect(formatServerStatus("")).toBe("Unknown");
    expect(formatServerStatus("   ")).toBe("Unknown");
    expect(formatServerStatus(undefined)).toBe("Unknown");
    expect(formatServerStatus(null)).toBe("Unknown");
    expect(formatServerStatus(42)).toBe("Unknown");
  });
});

describe("serverStatusBadgeVariant", () => {
  it("returns 'default' for ACTIVE", () => {
    expect(serverStatusBadgeVariant("ACTIVE")).toBe("default");
    expect(serverStatusBadgeVariant("active")).toBe("default");
  });

  it("returns 'destructive' for ERROR", () => {
    expect(serverStatusBadgeVariant("ERROR")).toBe("destructive");
  });

  it("returns 'outline' for transitional states", () => {
    expect(serverStatusBadgeVariant("BUILD")).toBe("outline");
    expect(serverStatusBadgeVariant("REBOOT")).toBe("outline");
    expect(serverStatusBadgeVariant("VERIFY_RESIZE")).toBe("outline");
  });

  it("falls back to 'secondary' for everything else", () => {
    expect(serverStatusBadgeVariant("SHUTOFF")).toBe("secondary");
    expect(serverStatusBadgeVariant("")).toBe("secondary");
    expect(serverStatusBadgeVariant(undefined)).toBe("secondary");
  });
});

describe("formatServerTaskState", () => {
  it("maps a known task state to its label", () => {
    expect(formatServerTaskState("powering_off")).toBe("Stopping");
    expect(formatServerTaskState("image_snapshot")).toBe("Creating Snapshot");
  });

  it("normalizes dashes to underscores before lookup", () => {
    expect(formatServerTaskState("powering-off")).toBe("Stopping");
  });

  it("humanizes an unknown task state", () => {
    expect(formatServerTaskState("doing_something")).toBe("Doing Something");
  });

  it("returns 'None' for empty or non-string input", () => {
    expect(formatServerTaskState("")).toBe("None");
    expect(formatServerTaskState(undefined)).toBe("None");
    expect(formatServerTaskState(null)).toBe("None");
  });
});

describe("formatServerPowerState", () => {
  it("maps known numeric power states", () => {
    expect(formatServerPowerState(1)).toBe("Running");
    expect(formatServerPowerState(4)).toBe("Shutdown");
  });

  it("accepts numeric strings", () => {
    expect(formatServerPowerState("1")).toBe("Running");
  });

  it("labels unknown but valid numbers", () => {
    expect(formatServerPowerState(99)).toBe("Unknown (99)");
  });

  it("returns 'Unknown' for non-numeric input", () => {
    expect(formatServerPowerState("not-a-number")).toBe("Unknown");
    expect(formatServerPowerState("")).toBe("Unknown");
    expect(formatServerPowerState(undefined)).toBe("Unknown");
    expect(formatServerPowerState(null)).toBe("Unknown");
  });
});

import { describe, expect, it } from "vitest";
import {
  isRecoveryResourceKind,
  recoveryDestination,
  recoveryPreferenceKind,
  recoveryResourceDescription,
  recoveryResourceLabel,
  resourceRecoveryPath,
} from "@/lib/resource-recovery";

describe("resource recovery", () => {
  it("maps resource kinds to fixed collection routes", () => {
    expect(recoveryDestination({ kind: "instance" })).toBe(
      "/compute/instances",
    );
    expect(recoveryDestination({ kind: "security-group" })).toBe(
      "/networking/security-groups",
    );
    expect(recoveryDestination({ kind: "share-snapshot" })).toBe(
      "/shared-file-systems/snapshots",
    );
    expect(
      recoveryDestination({ kind: "node-group", parentId: "cluster/id" }),
    ).toBe("/kubernetes/clusters/cluster%2Fid/node-groups");
    expect(
      recoveryDestination({ kind: "object", parentId: "bucket/name" }),
    ).toBe("/object-storage/buckets/bucket%2Fname");
    expect(
      recoveryDestination({
        kind: "object",
        parentId: "bucket/name",
        mode: "direct",
      }),
    ).toBe("/object-storage/buckets/bucket%2Fname/direct");
  });

  it("builds an encoded internal recovery request", () => {
    expect(
      resourceRecoveryPath({
        kind: "object",
        id: "folder/report 1.json",
        parentId: "project-data",
      }),
    ).toBe(
      "/api/preferences/resources/recover?kind=object&id=folder%2Freport+1.json&parentId=project-data",
    );
  });

  it("preserves long S3 object keys in recovery requests", () => {
    const key = `${"nested/".repeat(80)}report.json`;

    expect(
      new URL(
        resourceRecoveryPath({ kind: "object", id: key }),
        "http://local",
      ).searchParams.get("id"),
    ).toBe(key);
  });

  it("limits cookie cleanup to preference-backed resource kinds", () => {
    expect(recoveryPreferenceKind("cluster")).toBe("cluster");
    expect(recoveryPreferenceKind("router")).toBeUndefined();
  });

  it("provides safe labels and rejects unknown kinds", () => {
    expect(recoveryResourceLabel("floating-ip")).toBe("floating IP");
    expect(recoveryResourceDescription("bucket")).toContain(
      "current Object Storage role",
    );
    expect(isRecoveryResourceKind("volume")).toBe(true);
    expect(isRecoveryResourceKind("https://example.com")).toBe(false);
  });
});

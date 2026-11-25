import { describe, expect, it } from "vitest";
import {
  resourceDetailHref,
  type ResourceDetailKind,
} from "./resource-detail-paths";
import { resourcePreferenceHref } from "./resource-preferences";

describe("resource detail links", () => {
  it.each<[ResourceDetailKind, string]>([
    ["instance", "/compute/instances/resource-id/overview"],
    ["cluster", "/kubernetes/clusters/resource-id/overview"],
    ["cluster-template", "/kubernetes/templates/resource-id"],
    ["floating-ip", "/networking/floating-ips/resource-id"],
    ["load-balancer", "/networking/load-balancers/resource-id"],
    ["bucket", "/object-storage/buckets/resource-id"],
    ["instance-snapshot", "/compute/snapshots/resource-id"],
    ["share-snapshot", "/shared-file-systems/snapshots/resource-id"],
  ])(
    "resolves %s independently of the collection displaying it",
    (kind, url) => {
      expect(resourceDetailHref(kind, "resource-id")).toBe(url);
    },
  );

  it("encodes an identifier as one path segment and uses the same link for saved resources", () => {
    const id = "name with spaces/#?%";
    const href = resourceDetailHref("bucket", id);
    expect(href).toBe(
      "/object-storage/buckets/name%20with%20spaces%2F%23%3F%25",
    );
    expect(resourcePreferenceHref({ kind: "bucket", id })).toBe(href);
  });
});

import { describe, expect, it } from "vitest";
import type { CloudContextSnapshot } from "@/lib/cloud-context-snapshot";
import {
  mutationErrorForStatus,
  mutationScopeError,
  mutationSuccess,
  resolveMutationCapability,
} from "@/lib/mutations";

function cloudContext(
  overrides: Partial<CloudContextSnapshot> = {},
): CloudContextSnapshot {
  return {
    user: { name: "Sunrise Operator" },
    project: { id: "project-a", name: "Project A", status: "selected" },
    region: { id: "RegionOne", name: "RegionOne", status: "selected" },
    role: {
      arn: null,
      name: null,
      status: "unavailable",
      credentialExpiration: null,
      message: "No Object Storage role",
    },
    catalog: { status: "available", message: "Catalog available" },
    projects: [],
    regions: [],
    services: [
      {
        id: "compute",
        label: "Compute",
        description: "Virtual machines",
        href: "/compute",
        status: "available",
        message: "Available in RegionOne",
      },
    ],
    personalResources: { pinned: [], recent: [] },
    ...overrides,
  };
}

describe("mutation scope guards", () => {
  it("accepts normalized project IDs in the same region", () => {
    expect(
      mutationScopeError(
        { projectId: "ABC-123", regionId: "RegionOne" },
        { projectId: "abc123", regionId: "regionone" },
      ),
    ).toBeNull();
  });

  it("rejects a stale project before a mutation runs", () => {
    expect(
      mutationScopeError(
        { projectId: "project-b", regionId: "RegionOne" },
        { projectId: "project-a", regionId: "RegionOne" },
      ),
    ).toMatchObject({ code: "context-changed", retryable: true });
  });

  it("rejects a stale region for region-scoped services", () => {
    expect(
      mutationScopeError(
        { projectId: "project-a", regionId: "RegionTwo" },
        { projectId: "project-a", regionId: "RegionOne" },
      ),
    ).toMatchObject({ code: "context-changed", retryable: true });
  });

  it("allows regionless services to guard only the project", () => {
    expect(
      mutationScopeError(
        { projectId: "project-a", regionId: "RegionTwo" },
        { projectId: "project-a" },
        false,
      ),
    ).toBeNull();
  });
});

describe("mutation capabilities", () => {
  it("reports an available service while deferring permission to the API", () => {
    expect(
      resolveMutationCapability(cloudContext(), { serviceId: "compute" }),
    ).toEqual({
      status: "available",
      permission: "unknown",
      message:
        "Availability is confirmed; permission will be verified by the service.",
    });
  });

  it("blocks a capability when the current permission is denied", () => {
    expect(
      resolveMutationCapability(cloudContext(), {
        serviceId: "compute",
        permission: "denied",
      }),
    ).toMatchObject({ status: "unavailable", permission: "denied" });
  });

  it("blocks mutations without an active project", () => {
    expect(
      resolveMutationCapability(
        cloudContext({
          project: {
            id: null,
            name: "No project selected",
            status: "missing",
          },
        }),
        { serviceId: "compute" },
      ),
    ).toMatchObject({ status: "unavailable" });
  });
});

describe("mutation outcomes", () => {
  it("maps permission errors to a concise role message", () => {
    expect(
      mutationErrorForStatus(403, "delete this instance", "request-123"),
    ).toEqual({
      code: "permission-denied",
      message:
        "Your current role does not have permission to delete this instance.",
      requestId: "request-123",
      retryable: false,
      status: 403,
    });
  });

  it("represents partial batch mutations without losing successful work", () => {
    expect(
      mutationSuccess({
        data: { deleted: 2 },
        message: "Removed 2 objects.",
        scope: { projectId: "project-a" },
        issues: [{ resource: "locked.txt", message: "Access denied" }],
      }),
    ).toMatchObject({ ok: true, status: "partial" });
  });
});

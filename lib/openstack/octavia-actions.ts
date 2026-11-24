"use server";

import { z } from "zod";

import { microversionSupport } from "@/lib/openstack/capabilities";
import {
  discoverLoadBalancerCapabilities,
  OCTAVIA_AVAILABILITY_ZONE_MICROVERSION,
  OCTAVIA_BASELINE_MICROVERSION,
  OCTAVIA_TAGS_MICROVERSION,
} from "@/lib/openstack/capabilities-server";
import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationErrorForStatus,
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import { isOctaviaProvisioning } from "@/lib/openstack/octavia";
import {
  getLoadBalancer,
  getLoadBalancerDetails,
  listLoadBalancerAvailabilityZones,
  listLoadBalancers,
} from "@/lib/openstack/octavia-server";
import {
  sameOctaviaTags,
  validateOctaviaTags,
} from "@/lib/openstack/octavia-tags";
import { listFloatingIpsForPort } from "@/lib/openstack/neutron-floating-ip-server";
import type { NeutronFloatingIpReference } from "@/lib/openstack/neutron-floating-ip-server";
import type {
  OctaviaLoadBalancer,
  OctaviaLoadBalancerDetails,
} from "@/types/openstack";

const OCTAVIA_SERVICE = {
  serviceType: "load-balancer",
  serviceName: "octavia",
} as const;
const uuidSchema = z.string().uuid();
const createLoadBalancerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(255).optional(),
  vipSubnetId: uuidSchema,
  availabilityZone: z
    .string()
    .min(1)
    .max(255)
    .refine((value) => value.trim().length > 0, "Select an availability zone.")
    .optional(),
  adminStateUp: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});
const updateLoadBalancerSchema = z
  .object({
    name: z.string().max(255),
    description: z.string().max(255),
    adminStateUp: z.boolean(),
    tags: z.array(z.string()).optional(),
    source: z.object({
      name: z.string().max(255),
      description: z.string().max(255),
      adminStateUp: z.boolean(),
      tags: z.array(z.string()).optional(),
    }),
  })
  .superRefine((value, context) => {
    if (value.tags !== undefined && value.source.tags === undefined) {
      context.addIssue({
        code: "custom",
        message: "Tag updates require the source and replacement tag sets.",
      });
    }
  });

export type CreateLoadBalancerInput = z.input<typeof createLoadBalancerSchema>;
export type UpdateLoadBalancerInput = z.input<typeof updateLoadBalancerSchema>;

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function normalizeProjectId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

function loadBalancerFromPayload(
  payload: unknown,
  projectId: string,
  expectedId?: string,
) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !("loadbalancer" in payload)
  ) {
    throw new Error("Octavia did not return the load balancer");
  }
  const loadBalancer = payload.loadbalancer;
  if (
    !loadBalancer ||
    typeof loadBalancer !== "object" ||
    Array.isArray(loadBalancer)
  ) {
    throw new Error("Octavia returned an invalid load balancer");
  }
  const record = loadBalancer as Record<string, unknown>;
  if (
    !uuidSchema.safeParse(record.id).success ||
    (expectedId !== undefined && record.id !== expectedId) ||
    typeof record.project_id !== "string" ||
    normalizeProjectId(record.project_id) !== normalizeProjectId(projectId)
  ) {
    throw new Error("Octavia returned an invalid load balancer");
  }
  return loadBalancer as OctaviaLoadBalancer;
}

function preflightFailure(
  error: unknown,
  scope: MutationScope,
): MutationResult<never> {
  const record =
    error && typeof error === "object"
      ? (error as { name?: unknown; status?: unknown })
      : undefined;
  if (
    record?.name === "OpenStackRequestError" &&
    typeof record.status === "number"
  ) {
    return mutationFailure(
      mutationErrorForStatus(record.status, "read this load balancer"),
      scope,
    );
  }
  if (record?.name === "OpenStackConnectionError") {
    return mutationFailure(
      {
        code: "network-error",
        message: "Octavia could not be reached. Try again shortly.",
        retryable: true,
      },
      scope,
    );
  }
  return mutationFailure(
    {
      code: "service-error",
      message:
        "The load balancer could not be read before applying this change. Try again shortly.",
      retryable: true,
    },
    scope,
  );
}

async function readLoadBalancerForMutation(scope: MutationScope, id: string) {
  try {
    return {
      ok: true,
      value: await getLoadBalancer(id, scope.regionId, scope.projectId),
    } as const;
  } catch (error) {
    return { ok: false, result: preflightFailure(error, scope) } as const;
  }
}

function pendingMutationFailure(scope: MutationScope) {
  return mutationFailure(
    {
      code: "conflict",
      message:
        "Wait for the current load balancer operation to finish, then try again.",
      retryable: true,
    },
    scope,
  );
}

async function supportedMutationMicroversion(
  scope: MutationScope,
  requiredMicroversion: string,
  actionLabel: string,
) {
  const capabilities = await discoverLoadBalancerCapabilities(scope.regionId!);
  const support = microversionSupport(
    capabilities,
    requiredMicroversion,
    actionLabel,
  );
  if (support.status === "unsupported") {
    return {
      ok: false,
      result: mutationFailure(
        {
          code: "service-unavailable",
          message: support.message,
          retryable: false,
        },
        scope,
      ),
    } as const;
  }
  return {
    ok: true,
    version: support.requestedMicroversion ?? requiredMicroversion,
  } as const;
}

function requiredCreateMicroversion(value: {
  availabilityZone?: string;
  tags: string[];
}) {
  if (value.availabilityZone) return OCTAVIA_AVAILABILITY_ZONE_MICROVERSION;
  if (value.tags.length) return OCTAVIA_TAGS_MICROVERSION;
  return OCTAVIA_BASELINE_MICROVERSION;
}

export async function createLoadBalancerAction(
  scope: MutationScope,
  input: CreateLoadBalancerInput,
): Promise<MutationResult<OctaviaLoadBalancer>> {
  const parsed = createLoadBalancerSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? "Review the values and try again.",
    );
  }
  const value = parsed.data;
  const parsedTags = validateOctaviaTags(value.tags);
  if (!parsedTags.ok) return validationFailure(scope, parsedTags.error);

  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const requiredMicroversion = requiredCreateMicroversion(value);
  const supported = await supportedMutationMicroversion(
    activeScope,
    requiredMicroversion,
    "Creating this load balancer",
  );
  if (!supported.ok) return supported.result;

  return executeOpenStackMutation<OctaviaLoadBalancer>({
    actionLabel: "create a load balancer",
    scope: activeScope,
    ...OCTAVIA_SERVICE,
    path: "/v2/lbaas/loadbalancers",
    method: "POST",
    apiVersion: `load-balancer ${supported.version}`,
    body: {
      loadbalancer: {
        name: value.name,
        description: value.description || undefined,
        project_id: activeScope.projectId,
        vip_subnet_id: value.vipSubnetId,
        availability_zone: value.availabilityZone || undefined,
        admin_state_up: value.adminStateUp,
        tags: value.tags.length ? parsedTags.tags : undefined,
      },
    },
    invalidates: ["/networking", "/networking/load-balancers", "/quotas"],
    successMessage: `Load balancer ${value.name} is being created.`,
    transform: (payload) =>
      loadBalancerFromPayload(payload, activeScope.projectId),
  });
}

export async function updateLoadBalancerAction(
  scope: MutationScope,
  id: string,
  input: UpdateLoadBalancerInput,
): Promise<MutationResult<OctaviaLoadBalancer>> {
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(scope, "Select a valid load balancer.");
  }
  const parsed = updateLoadBalancerSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? "Review the values and try again.",
    );
  }
  const value = parsed.data;
  const parsedTags =
    value.tags === undefined ? null : validateOctaviaTags(value.tags);
  if (parsedTags && !parsedTags.ok) {
    return validationFailure(scope, parsedTags.error);
  }
  if (value.source.tags !== undefined) {
    const sourceTags = validateOctaviaTags(value.source.tags);
    if (!sourceTags.ok) return validationFailure(scope, sourceTags.error);
  }

  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const existing = await readLoadBalancerForMutation(
    activeScope,
    parsedId.data,
  );
  if (!existing.ok) return existing.result;
  if (isOctaviaProvisioning(existing.value)) {
    return pendingMutationFailure(activeScope);
  }
  if (value.tags !== undefined && !Array.isArray(existing.value.tags)) {
    return mutationFailure(
      {
        code: "service-error",
        message:
          "Octavia did not return the existing tags. Refresh and try again.",
        retryable: true,
      },
      activeScope,
    );
  }
  const sourceChanged =
    value.source.name !== existing.value.name ||
    value.source.description !== (existing.value.description ?? "") ||
    value.source.adminStateUp !== existing.value.admin_state_up;
  if (
    sourceChanged ||
    (value.tags !== undefined &&
      !sameOctaviaTags(value.source.tags ?? [], existing.value.tags ?? []))
  ) {
    return mutationFailure(
      {
        code: "conflict",
        message:
          "The load balancer changed while this form was open. Refresh and try again.",
        retryable: true,
      },
      activeScope,
    );
  }
  const requiredMicroversion =
    value.tags === undefined
      ? OCTAVIA_BASELINE_MICROVERSION
      : OCTAVIA_TAGS_MICROVERSION;
  const supported = await supportedMutationMicroversion(
    activeScope,
    requiredMicroversion,
    "Updating this load balancer",
  );
  if (!supported.ok) return supported.result;

  return executeOpenStackMutation<OctaviaLoadBalancer>({
    actionLabel: "edit this load balancer",
    scope: activeScope,
    ...OCTAVIA_SERVICE,
    path: `/v2/lbaas/loadbalancers/${encodeURIComponent(parsedId.data)}`,
    method: "PUT",
    apiVersion: `load-balancer ${supported.version}`,
    body: {
      loadbalancer: {
        name: value.name,
        description: value.description,
        admin_state_up: value.adminStateUp,
        ...(parsedTags ? { tags: parsedTags.tags } : {}),
      },
    },
    invalidates: [
      "/networking",
      "/networking/load-balancers",
      `/networking/load-balancers/${parsedId.data}`,
    ],
    successMessage: "Load balancer update requested.",
    transform: (payload) =>
      loadBalancerFromPayload(payload, activeScope.projectId, parsedId.data),
  });
}

export async function deleteLoadBalancerAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<null>> {
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(scope, "Select a valid load balancer.");
  }
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const existing = await readLoadBalancerForMutation(
    activeScope,
    parsedId.data,
  );
  if (!existing.ok) return existing.result;
  if (isOctaviaProvisioning(existing.value)) {
    return pendingMutationFailure(activeScope);
  }
  if (
    (existing.value.listeners?.length ?? 0) > 0 ||
    (existing.value.pools?.length ?? 0) > 0
  ) {
    return validationFailure(
      activeScope,
      "Remove this load balancer's listeners and pools before deleting it.",
    );
  }
  const supported = await supportedMutationMicroversion(
    activeScope,
    OCTAVIA_BASELINE_MICROVERSION,
    "Deleting this load balancer",
  );
  if (!supported.ok) return supported.result;

  return executeOpenStackMutation<null>({
    actionLabel: "delete this load balancer",
    scope: activeScope,
    ...OCTAVIA_SERVICE,
    path: `/v2/lbaas/loadbalancers/${encodeURIComponent(parsedId.data)}`,
    method: "DELETE",
    apiVersion: `load-balancer ${supported.version}`,
    invalidates: [
      "/networking",
      "/networking/load-balancers",
      `/networking/load-balancers/${parsedId.data}`,
      "/quotas",
    ],
    removedResource: { kind: "load-balancer", id: parsedId.data },
    successMessage: "Load balancer deletion requested.",
  });
}

export async function listLoadBalancersAction(
  regionId?: string,
  projectId?: string,
): Promise<OctaviaLoadBalancer[]> {
  return listLoadBalancers(regionId, projectId);
}

export async function listLoadBalancerAvailabilityZonesAction(
  regionId?: string,
  projectId?: string,
) {
  return listLoadBalancerAvailabilityZones(regionId, projectId);
}

export async function getLoadBalancerDetailsAction(
  id: string,
  regionId?: string,
  projectId?: string,
): Promise<OctaviaLoadBalancerDetails> {
  return getLoadBalancerDetails(id, regionId, projectId);
}

export async function listLoadBalancerFloatingIpsAction(
  portId: string,
  regionId?: string,
  projectId?: string,
): Promise<NeutronFloatingIpReference[]> {
  return listFloatingIpsForPort(portId, regionId, projectId);
}

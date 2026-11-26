"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  microversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
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
import {
  canChangeOctaviaListener,
  canChangeOctaviaListeners,
  isOctaviaAmphoraProvider,
  isOctaviaProvisioning,
  loadBalancerListenerPath,
  loadBalancerPoolPath,
  octaviaListenerDeletionBlock,
} from "@/lib/openstack/octavia";
import {
  canChangeHealthMonitor,
  changedHealthMonitorFields,
  healthMonitorSettingsSchema,
  healthMonitorSnapshotSchema,
  healthMonitorTypeForPool,
  readHealthMonitorSettings,
} from "@/lib/openstack/octavia-health-monitor-settings";
import {
  availableListenerProtocols,
  editableListenerInsertHeaders,
  isListenerInsertHeaderEnabled,
  LISTENER_CIDR_LENGTH_MAX,
  LISTENER_CIDR_MAX,
  LISTENER_INSERT_HEADERS,
  LISTENER_NUMERIC_FIELDS,
  LISTENER_NUMERIC_KEYS,
  LISTENER_SETTING_KEYS,
  listenerCidrError,
  listenerReadApiVersion,
  listenerSettingUnavailable,
  OCTAVIA_LISTENER_PROTOCOLS,
  readListenerInsertHeaders,
  requiredListenerWriteVersion,
  sameListenerCidrs,
  type ListenerNumericField,
  type ListenerSettingKey,
} from "@/lib/openstack/octavia-listener-settings";
import {
  availablePoolProtocols,
  canAttachNewOctaviaPool,
  canChangeOctaviaPoolMembers,
  canUseOctaviaPoolAsDefault,
  OCTAVIA_POOL_ALGORITHMS,
  OCTAVIA_POOL_PERSISTENCE_MODES,
  OCTAVIA_POOL_PROTOCOLS,
  octaviaPoolDeletionBlock,
  poolPersistenceError,
  readPoolPersistence,
  samePoolPersistence,
  supportsOctaviaDefaultPoolChanges,
} from "@/lib/openstack/octavia-pool-settings";
import {
  getLoadBalancer,
  getLoadBalancerDetails,
  getLoadBalancerListener,
  getLoadBalancerListenerDetails,
  getLoadBalancerPool,
  getLoadBalancerPoolDetails,
  getOctaviaPoolHealthMonitor,
  getOctaviaPoolMember,
  listLoadBalancerAvailabilityZones,
  listLoadBalancerPoolChoices,
  listLoadBalancers,
  listOctaviaPoolRedirectPolicies,
} from "@/lib/openstack/octavia-server";
import { openstackRequest } from "@/lib/openstack/request-server";
import { OpenStackRequestError } from "@/lib/openstack/request";
import {
  sameOctaviaTags,
  validateOctaviaTags,
} from "@/lib/openstack/octavia-tags";
import {
  fixedVipAddressError,
  INVALID_FIXED_VIP,
} from "@/lib/openstack/octavia-vip-address";
import { listFloatingIpsForPort } from "@/lib/openstack/neutron-floating-ip-server";
import type { NeutronFloatingIpReference } from "@/lib/openstack/neutron-floating-ip-server";
import type {
  OctaviaLoadBalancer,
  OctaviaLoadBalancerDetails,
  OctaviaListener,
  OctaviaPool,
} from "@/types/openstack";

const OCTAVIA_SERVICE = {
  serviceType: "load-balancer",
  serviceName: "octavia",
} as const;
const uuidSchema = z.string().uuid();
const createLoadBalancerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(255).optional(),
  vipSubnetId: uuidSchema.toLowerCase(),
  vipAddress: z.string().trim().pipe(z.ipv4(INVALID_FIXED_VIP)).optional(),
  availabilityZone: z
    .string()
    .min(1)
    .max(255)
    .refine((value) => value.trim().length > 0, "Select an availability zone.")
    .optional(),
  adminStateUp: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});
const vipSubnetResponse = z.object({
  subnet: z.object({
    id: uuidSchema.toLowerCase(),
    ip_version: z.union([z.literal(4), z.literal(6)]),
    cidr: z.string(),
  }),
});
const vipAssignmentsResponse = z.object({
  loadbalancers: z.array(
    z.object({
      project_id: z.string(),
      vip_subnet_id: uuidSchema.toLowerCase(),
      vip_address: z.ipv4(),
    }),
  ),
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

const administrativeFields = z.object({
  name: z.string().max(255),
  description: z.string().max(255),
  adminStateUp: z.boolean(),
});
const listenerSettingsSchema = z.object({
  ...(Object.fromEntries(
    LISTENER_NUMERIC_KEYS.map((key) => [
      key,
      z
        .number()
        .int()
        .min(LISTENER_NUMERIC_FIELDS[key].min)
        .max(LISTENER_NUMERIC_FIELDS[key].max)
        .nullable()
        .optional(),
    ]),
  ) as Record<ListenerNumericField, z.ZodOptional<z.ZodNullable<z.ZodNumber>>>),
  allowed_cidrs: z
    .array(z.string().trim().min(1).max(LISTENER_CIDR_LENGTH_MAX))
    .max(LISTENER_CIDR_MAX)
    .optional(),
});
const listenerFieldsWithSettings = administrativeFields.extend({
  settings: listenerSettingsSchema.optional(),
});
const listenerMutationSchema = z.discriminatedUnion("action", [
  listenerFieldsWithSettings.extend({
    action: z.literal("create"),
    protocol: z.enum(OCTAVIA_LISTENER_PROTOCOLS),
    port: z.number().int().min(1).max(65535),
  }),
  listenerFieldsWithSettings.extend({
    action: z.literal("edit"),
    id: uuidSchema,
    source: listenerFieldsWithSettings,
    defaultPool: z
      .object({
        before: uuidSchema.nullable(),
        after: uuidSchema.nullable(),
      })
      .optional(),
    insertHeaders: z
      .partialRecord(
        z.enum(LISTENER_INSERT_HEADERS),
        z.object({
          before: z.string().max(1024).nullable(),
          enabled: z.boolean(),
        }),
      )
      .optional(),
  }),
  z.object({ action: z.literal("delete"), id: uuidSchema }),
]);

export type OctaviaListenerMutation = z.input<typeof listenerMutationSchema>;

const poolFields = administrativeFields.extend({
  algorithm: z.string().min(1).max(255),
});
const poolPersistenceSchema = z.object({
  type: z.enum(OCTAVIA_POOL_PERSISTENCE_MODES),
  cookie_name: z.string().max(255).optional(),
});
const poolPersistenceSnapshotSchema = z
  .object({
    type: z.string().min(1).max(255),
    cookie_name: z.string().max(255).nullable(),
    persistence_timeout: z.number().int().nullable(),
    persistence_granularity: z.string().max(255).nullable(),
  })
  .nullable();
const poolMutationSchema = z.discriminatedUnion("action", [
  poolFields.extend({
    action: z.literal("create"),
    protocol: z.enum(OCTAVIA_POOL_PROTOCOLS),
    algorithm: z.enum(OCTAVIA_POOL_ALGORITHMS),
    listenerId: uuidSchema.optional(),
    persistence: poolPersistenceSchema.optional(),
  }),
  poolFields.extend({
    action: z.literal("edit"),
    id: uuidSchema,
    source: poolFields,
    persistence: z
      .object({
        before: poolPersistenceSnapshotSchema,
        after: poolPersistenceSchema.nullable(),
      })
      .optional(),
  }),
  z.object({
    action: z.literal("delete"),
    id: uuidSchema,
    listenerIds: z.array(uuidSchema),
  }),
]);
export type OctaviaPoolMutation = z.input<typeof poolMutationSchema>;

const memberWeightSchema = z.number().int().min(0).max(256);
const memberFields = z.object({
  name: z.string().max(255),
  adminStateUp: z.boolean(),
  weight: memberWeightSchema.optional(),
});
const memberMutationSchema = z.discriminatedUnion("action", [
  memberFields.extend({
    action: z.literal("create"),
    address: z
      .string()
      .trim()
      .pipe(z.union([z.ipv4(), z.ipv6()])),
    port: z.number().int().min(1).max(65535),
    subnetId: uuidSchema.optional(),
  }),
  memberFields.extend({
    action: z.literal("edit"),
    id: uuidSchema,
    source: memberFields,
  }),
  z.object({ action: z.literal("delete"), id: uuidSchema }),
]);
export type OctaviaMemberMutation = z.input<typeof memberMutationSchema>;

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
  resource = "load balancer",
): MutationResult<never> {
  unstable_rethrow(error);
  const record =
    error && typeof error === "object"
      ? (error as { name?: unknown; status?: unknown })
      : undefined;
  if (
    record?.name === "OpenStackRequestError" &&
    typeof record.status === "number"
  ) {
    return mutationFailure(
      mutationErrorForStatus(record.status, "read this " + resource),
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
        "The " +
        resource +
        " could not be read before applying this change. Try again shortly.",
      retryable: true,
    },
    scope,
  );
}

async function readLoadBalancerForMutation(
  scope: MutationScope,
  id: string,
  listenerCapabilities?: OpenStackServiceCapabilities,
) {
  try {
    return {
      ok: true,
      value: await getLoadBalancer(
        id,
        scope.regionId,
        scope.projectId,
        ...(listenerCapabilities ? ([listenerCapabilities] as const) : []),
      ),
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
  knownCapabilities?: OpenStackServiceCapabilities,
) {
  const capabilities =
    knownCapabilities ??
    (await discoverLoadBalancerCapabilities(scope.regionId!));
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

async function verifyFixedVip(
  scope: MutationScope,
  subnetId: string,
  address: string,
): Promise<MutationResult<never> | null> {
  try {
    const subnet = vipSubnetResponse.safeParse(
      await openstackRequest({
        regionId: scope.regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: `/v2.0/subnets/${subnetId}`,
        errorMode: "throw",
      }),
    );
    if (subnet.success && subnet.data.subnet.id === subnetId) {
      const error = fixedVipAddressError(address, subnet.data.subnet);
      return error ? validationFailure(scope, error) : null;
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof OpenStackRequestError) {
      return mutationFailure(
        mutationErrorForStatus(error.status, "read the selected VIP subnet"),
        scope,
      );
    }
  }
  return mutationFailure(
    {
      code: "service-error",
      message:
        "The selected VIP subnet could not be verified. Try again shortly.",
      retryable: true,
    },
    scope,
  );
}

async function hasVisibleVipAssignment(
  scope: MutationScope,
  subnetId: string,
  address: string,
) {
  const projectId = normalizeProjectId(scope.projectId);
  const query = new URLSearchParams({
    project_id: projectId,
    vip_subnet_id: subnetId,
    vip_address: address,
    limit: "1",
  });
  for (const field of ["project_id", "vip_subnet_id", "vip_address"]) {
    query.append("fields", field);
  }
  const result = vipAssignmentsResponse.safeParse(
    await openstackRequest({
      ...OCTAVIA_SERVICE,
      regionId: scope.regionId!,
      path: `/v2/lbaas/loadbalancers?${query}`,
    }),
  );
  return (
    result.success &&
    result.data.loadbalancers.some(
      (loadBalancer) =>
        normalizeProjectId(loadBalancer.project_id) === projectId &&
        loadBalancer.vip_subnet_id === subnetId &&
        loadBalancer.vip_address === address,
    )
  );
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
  if (value.vipAddress) {
    const error = await verifyFixedVip(
      activeScope,
      value.vipSubnetId,
      value.vipAddress,
    );
    if (error) return error;
  }
  const requiredMicroversion = requiredCreateMicroversion(value);
  const supported = await supportedMutationMicroversion(
    activeScope,
    requiredMicroversion,
    "Creating this load balancer",
  );
  if (!supported.ok) return supported.result;

  const result = await executeOpenStackMutation<OctaviaLoadBalancer>({
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
        ...(value.vipAddress ? { vip_address: value.vipAddress } : {}),
        availability_zone: value.availabilityZone || undefined,
        admin_state_up: value.adminStateUp,
        tags: value.tags.length ? parsedTags.tags : undefined,
      },
    },
    invalidates: ["/networking", "/networking/load-balancers", "/quotas"],
    successMessage: `Load balancer ${value.name} is being created.`,
    transform: (payload) => {
      const created = loadBalancerFromPayload(payload, activeScope.projectId);
      if (
        value.vipAddress &&
        (created.vip_address !== value.vipAddress ||
          created.vip_subnet_id?.toLowerCase() !== value.vipSubnetId)
      ) {
        throw new Error("Octavia did not return the requested fixed VIP");
      }
      return created;
    },
  });
  if (
    !result.ok &&
    value.vipAddress &&
    (result.error.status === 409 || (result.error.status ?? 0) >= 500) &&
    (await hasVisibleVipAssignment(
      activeScope,
      value.vipSubnetId,
      value.vipAddress,
    ))
  ) {
    return {
      ...result,
      error: {
        ...result.error,
        message:
          "This VIP is already assigned to a load balancer in this project. Check the load balancer list or choose a different address.",
      },
    };
  }
  return result;
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

export async function mutateLoadBalancerListenerAction(
  scope: MutationScope,
  loadBalancerId: string,
  input: OctaviaListenerMutation,
): Promise<MutationResult<null>> {
  const parent = uuidSchema.safeParse(loadBalancerId);
  if (!parent.success)
    return validationFailure(scope, "Select a valid load balancer.");
  const parsed = listenerMutationSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return validationFailure(
      scope,
      field === "port"
        ? "Enter a whole port number from 1 to 65535."
        : "Review the listener settings and try again.",
    );
  }
  const value = parsed.data;
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const parentId = parent.data.toLowerCase();
  const capabilities = await discoverLoadBalancerCapabilities(
    activeScope.regionId!,
  );
  const existing = await readLoadBalancerForMutation(
    activeScope,
    parentId,
    capabilities,
  );
  if (!existing.ok) return existing.result;
  if (existing.value.id !== parentId) {
    return mutationFailure(
      mutationErrorForStatus(404, "read this load balancer"),
      activeScope,
    );
  }
  if (!canChangeOctaviaListeners(existing.value)) {
    return mutationFailure(
      {
        code: "conflict",
        message: "The load balancer must be Active to change its listeners.",
        retryable: true,
      },
      activeScope,
    );
  }

  const collection = "/v2/lbaas/listeners";
  const listenerId = value.action === "create" ? null : value.id.toLowerCase();
  const path = listenerId ? `${collection}/${listenerId}` : collection;
  let body: Record<string, unknown> | undefined;
  let listener: OctaviaListener | undefined;
  if (value.action === "create") {
    if (
      !availableListenerProtocols(
        existing.value.provider,
        capabilities,
      ).includes(value.protocol)
    ) {
      return validationFailure(
        activeScope,
        "This listener protocol is not available for the load balancer provider and API version.",
      );
    }
    body = {
      name: value.name,
      description: value.description,
      admin_state_up: value.adminStateUp,
      protocol: value.protocol,
      protocol_port: value.port,
      loadbalancer_id: parentId,
    };
  } else {
    if (
      !Array.isArray(existing.value.listeners) ||
      !existing.value.listeners.some(
        (reference) => reference?.id === listenerId,
      )
    ) {
      return mutationFailure(
        mutationErrorForStatus(404, "read this listener"),
        activeScope,
      );
    }
    try {
      listener = await getLoadBalancerListener(
        parentId,
        value.id.toLowerCase(),
        activeScope.regionId,
        activeScope.projectId,
        value.action === "edit" && (value.settings || value.insertHeaders)
          ? listenerReadApiVersion(capabilities)
          : undefined,
      );
    } catch (error) {
      return preflightFailure(error, activeScope, "listener");
    }
    if (!canChangeOctaviaListener(listener)) {
      return pendingMutationFailure(activeScope);
    }
    if (value.action === "delete") {
      const blocked = octaviaListenerDeletionBlock(listener);
      if (blocked) return validationFailure(activeScope, blocked);
    } else {
      const currentName = listener.name ?? "";
      const currentDescription = listener.description ?? "";
      if (
        value.source.name !== currentName ||
        value.source.description !== currentDescription ||
        value.source.adminStateUp !== listener.admin_state_up
      ) {
        return mutationFailure(
          {
            code: "conflict",
            message:
              "The listener changed while this form was open. Refresh and try again.",
            retryable: true,
          },
          activeScope,
        );
      }
      body = {
        ...(value.name !== currentName ? { name: value.name } : {}),
        ...(value.description !== currentDescription
          ? { description: value.description }
          : {}),
        ...(value.adminStateUp !== listener.admin_state_up
          ? { admin_state_up: value.adminStateUp }
          : {}),
      };
      if (value.defaultPool) {
        const { before, after } = value.defaultPool;
        const expected = before?.toLowerCase() ?? null;
        const next = after?.toLowerCase() ?? null;
        const current = listener.default_pool_id;
        if (
          (typeof current === "string" ? current.toLowerCase() : current) !==
          expected
        ) {
          return mutationFailure(
            {
              code: "conflict",
              message:
                "The listener's default pool changed or could not be verified. Refresh and try again.",
              retryable: true,
            },
            activeScope,
          );
        }
        if (next !== expected) {
          if (
            !supportsOctaviaDefaultPoolChanges(
              existing.value.provider,
              listener.protocol,
            )
          ) {
            return validationFailure(
              activeScope,
              "Changing the default pool is not available for this listener.",
            );
          }
          if (next !== null) {
            if (
              !Array.isArray(existing.value.pools) ||
              !existing.value.pools.some((ref) => ref?.id === next)
            ) {
              return validationFailure(
                activeScope,
                "Select a pool on this load balancer.",
              );
            }
            try {
              const pool = await getLoadBalancerPool(
                parentId,
                next,
                activeScope.regionId,
                activeScope.projectId,
              );
              if (
                !canUseOctaviaPoolAsDefault(
                  pool,
                  existing.value.provider,
                  capabilities,
                  listener.protocol,
                )
              ) {
                return validationFailure(
                  activeScope,
                  "Select an Active pool with a protocol compatible with this listener.",
                );
              }
            } catch (error) {
              return preflightFailure(error, activeScope, "selected pool");
            }
          }
          body.default_pool_id = next;
        }
      }
    }
  }

  const settingsKeys: ListenerSettingKey[] = [];
  let hasForwardedProto = false;
  if (value.action !== "delete" && body) {
    for (const key of LISTENER_SETTING_KEYS) {
      const next = value.settings?.[key];
      if (next === undefined) continue;
      if (
        value.action === "create" &&
        (next === null || (Array.isArray(next) && !next.length))
      )
        continue;
      const protocol =
        value.action === "create" ? value.protocol : listener!.protocol;
      const unavailable = listenerSettingUnavailable(
        key,
        existing.value,
        protocol,
        capabilities,
        next,
      );
      if (unavailable) return validationFailure(activeScope, unavailable);
      if (key === "allowed_cidrs" && Array.isArray(next)) {
        const error = listenerCidrError(next, existing.value);
        if (error) return validationFailure(activeScope, error);
      }
      if (value.action === "edit") {
        const current =
          key === "allowed_cidrs" && listener![key] === null
            ? []
            : listener![key];
        const expected = value.source.settings?.[key];
        if (
          current === undefined ||
          expected === undefined ||
          (Array.isArray(current) && Array.isArray(expected)
            ? !sameListenerCidrs(current, expected)
            : current !== expected)
        ) {
          return mutationFailure(
            {
              code: "conflict",
              message:
                "The listener's advanced settings changed or could not be verified. Refresh and try again.",
              retryable: true,
            },
            activeScope,
          );
        }
        if (
          Array.isArray(current) && Array.isArray(next)
            ? sameListenerCidrs(current, next)
            : current === next
        )
          continue;
      }
      body[key] = next;
      settingsKeys.push(key);
    }
    if (value.action === "edit" && value.insertHeaders && listener) {
      const changes = LISTENER_INSERT_HEADERS.filter(
        (header) => value.insertHeaders?.[header] !== undefined,
      );
      if (changes.length) {
        const supportedHeaders = editableListenerInsertHeaders(
          existing.value.provider,
          listener.protocol,
          capabilities,
        );
        if (changes.some((header) => !supportedHeaders.includes(header))) {
          return validationFailure(
            activeScope,
            "Header insertion is not available for this listener, provider, or API version.",
          );
        }
        const headers = readListenerInsertHeaders(listener.insert_headers);
        if (
          !headers ||
          changes.some(
            (header) =>
              (headers[header] ?? null) !==
              value.insertHeaders?.[header]?.before,
          )
        ) {
          return mutationFailure(
            {
              code: "conflict",
              message:
                "The listener's inserted headers changed or could not be verified. Refresh and try again.",
              retryable: true,
            },
            activeScope,
          );
        }
        let headersChanged = false;
        for (const header of changes) {
          const change = value.insertHeaders[header];
          if (
            !change ||
            change.enabled === isListenerInsertHeaderEnabled(headers[header])
          )
            continue;
          // Octavia replaces the map, so start from its fresh values, not a client copy.
          if (change.enabled) headers[header] = "True";
          else delete headers[header];
          headersChanged = true;
        }
        if (headersChanged) {
          body.insert_headers = headers;
          hasForwardedProto = Object.hasOwn(headers, "X-Forwarded-Proto");
        }
      }
    }
    if (Object.keys(body).length === 0)
      return validationFailure(activeScope, "No listener settings changed.");
  }

  const labels = {
    create: "create a listener",
    edit: "update this listener",
    delete: "delete this listener",
  } as const;
  const supported = await supportedMutationMicroversion(
    activeScope,
    requiredListenerWriteVersion(
      settingsKeys,
      value.action === "create" ? value.protocol : undefined,
      hasForwardedProto,
    ),
    "Changing load balancer listeners",
    capabilities,
  );
  if (!supported.ok) return supported.result;

  return executeOpenStackMutation<null>({
    actionLabel: labels[value.action],
    scope: activeScope,
    ...OCTAVIA_SERVICE,
    path,
    method:
      value.action === "create"
        ? "POST"
        : value.action === "edit"
          ? "PUT"
          : "DELETE",
    apiVersion: `load-balancer ${supported.version}`,
    ...(body ? { body: { listener: body } } : {}),
    invalidates: [
      "/networking/load-balancers",
      `/networking/load-balancers/${parentId}`,
      ...(listenerId ? [loadBalancerListenerPath(parentId, listenerId)] : []),
      "/quotas",
    ],
    successMessage: {
      create: "Listener creation requested.",
      edit:
        value.action === "edit" && Object.hasOwn(body ?? {}, "default_pool_id")
          ? "Default pool change requested."
          : "Listener update requested.",
      delete: "Listener deletion requested.",
    }[value.action],
    transform: (payload) => {
      if (value.action === "delete") return null;
      const response = z
        .object({
          listener: z.object({
            id: uuidSchema,
            project_id: z.string(),
            loadbalancers: z.tuple([z.object({ id: uuidSchema })]),
          }),
        })
        .safeParse(payload);
      if (
        !response.success ||
        (listenerId && response.data.listener.id !== listenerId) ||
        response.data.listener.loadbalancers[0].id !== parentId ||
        normalizeProjectId(response.data.listener.project_id) !==
          normalizeProjectId(activeScope.projectId)
      ) {
        throw new Error("Octavia returned an invalid listener");
      }
      return null;
    },
  });
}

export async function mutateLoadBalancerPoolAction(
  scope: MutationScope,
  loadBalancerId: string,
  input: OctaviaPoolMutation,
): Promise<MutationResult<null>> {
  const parent = uuidSchema.safeParse(loadBalancerId);
  const parsed = poolMutationSchema.safeParse(input);
  if (!parent.success || !parsed.success) {
    return validationFailure(scope, "Review the pool settings and try again.");
  }
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const parentId = parent.data.toLowerCase();
  const value = parsed.data;
  const capabilities = await discoverLoadBalancerCapabilities(
    activeScope.regionId!,
  );
  const existing = await readLoadBalancerForMutation(
    activeScope,
    parentId,
    capabilities,
  );
  if (!existing.ok) return existing.result;
  if (existing.value.id !== parentId) {
    return mutationFailure(
      mutationErrorForStatus(404, "read this load balancer"),
      activeScope,
    );
  }
  if (!canChangeOctaviaListeners(existing.value)) {
    return pendingMutationFailure(activeScope);
  }
  const provider = existing.value.provider;
  if (!isOctaviaAmphoraProvider(provider)) {
    return validationFailure(
      activeScope,
      "Changing pools is not available for this load balancer provider.",
    );
  }

  const poolId = value.action === "create" ? null : value.id.toLowerCase();
  let body: Record<string, unknown> | undefined;
  let protocol: string;
  if (value.action === "create") {
    const listenerId = value.listenerId?.toLowerCase();
    let listenerProtocol: string | undefined;
    if (listenerId) {
      if (
        !Array.isArray(existing.value.listeners) ||
        !existing.value.listeners.some((ref) => ref?.id === listenerId)
      ) {
        return mutationFailure(
          mutationErrorForStatus(404, "read this listener"),
          activeScope,
        );
      }
      try {
        const listener = await getLoadBalancerListener(
          parentId,
          listenerId,
          activeScope.regionId,
          activeScope.projectId,
        );
        if (!canAttachNewOctaviaPool(listener)) {
          return validationFailure(
            activeScope,
            "Select an Active listener without a default pool.",
          );
        }
        listenerProtocol = listener.protocol;
      } catch (error) {
        return preflightFailure(error, activeScope, "listener");
      }
    }
    protocol = value.protocol;
    if (
      !availablePoolProtocols(
        provider,
        capabilities,
        listenerProtocol,
      ).includes(value.protocol)
    ) {
      return validationFailure(
        activeScope,
        "This pool protocol is not available for the selected listener, provider, or API version.",
      );
    }
    if (value.persistence) {
      const error = poolPersistenceError(protocol, value.persistence);
      if (error) return validationFailure(activeScope, error);
    }
    body = {
      name: value.name,
      description: value.description,
      admin_state_up: value.adminStateUp,
      protocol,
      lb_algorithm: value.algorithm,
      ...(value.persistence ? { session_persistence: value.persistence } : {}),
      ...(listenerId
        ? { listener_id: listenerId }
        : { loadbalancer_id: parentId }),
    };
  } else {
    const id = value.id.toLowerCase();
    if (
      !Array.isArray(existing.value.pools) ||
      !existing.value.pools.some((ref) => ref?.id === id)
    ) {
      return mutationFailure(
        mutationErrorForStatus(404, "read this pool"),
        activeScope,
      );
    }
    let pool: OctaviaPool;
    try {
      pool = await getLoadBalancerPool(
        parentId,
        id,
        activeScope.regionId,
        activeScope.projectId,
      );
    } catch (error) {
      return preflightFailure(error, activeScope, "pool");
    }
    if (!canChangeOctaviaListener(pool))
      return pendingMutationFailure(activeScope);
    protocol = pool.protocol;
    if (value.action === "delete") {
      try {
        const policies = await listOctaviaPoolRedirectPolicies(
          id,
          activeScope.regionId,
          activeScope.projectId,
        );
        const blocked = octaviaPoolDeletionBlock(pool, policies);
        if (blocked) return validationFailure(activeScope, blocked);
      } catch (error) {
        return preflightFailure(
          error,
          activeScope,
          "pool's L7 policy dependencies",
        );
      }
      const actual = pool.listeners!.map(({ id }) => id).sort();
      const expected = value.listenerIds.map((id) => id.toLowerCase()).sort();
      if (
        actual.length !== expected.length ||
        actual.some((id, index) => id !== expected[index])
      ) {
        return mutationFailure(
          {
            code: "conflict",
            message:
              "This pool's listener attachments changed. Refresh before deleting it.",
            retryable: true,
          },
          activeScope,
        );
      }
    } else {
      const currentName = pool.name ?? "";
      const currentDescription = pool.description ?? "";
      if (
        value.source.name !== currentName ||
        value.source.description !== currentDescription ||
        value.source.adminStateUp !== pool.admin_state_up ||
        value.source.algorithm !== pool.lb_algorithm
      ) {
        return mutationFailure(
          {
            code: "conflict",
            message:
              "The pool changed while this form was open. Refresh and try again.",
            retryable: true,
          },
          activeScope,
        );
      }
      if (
        value.algorithm !== pool.lb_algorithm &&
        !z.enum(OCTAVIA_POOL_ALGORITHMS).safeParse(value.algorithm).success
      ) {
        return validationFailure(
          activeScope,
          "Select a supported load balancing algorithm.",
        );
      }
      body = {
        ...(value.name !== currentName ? { name: value.name } : {}),
        ...(value.description !== currentDescription
          ? { description: value.description }
          : {}),
        ...(value.adminStateUp !== pool.admin_state_up
          ? { admin_state_up: value.adminStateUp }
          : {}),
        ...(value.algorithm !== pool.lb_algorithm
          ? { lb_algorithm: value.algorithm }
          : {}),
      };
      if (value.persistence) {
        const current = readPoolPersistence(pool.session_persistence);
        const { before, after } = value.persistence;
        if (current === undefined || !samePoolPersistence(current, before)) {
          return mutationFailure(
            {
              code: "conflict",
              message:
                "The pool's session persistence changed or could not be verified. Refresh and try again.",
              retryable: true,
            },
            activeScope,
          );
        }
        const error = poolPersistenceError(protocol, after);
        if (error) return validationFailure(activeScope, error);
        // Reselecting a mode must not reset provider or UDP-specific settings.
        if (
          current?.type !== after?.type ||
          (after?.type === "APP_COOKIE" &&
            current?.cookie_name !== after.cookie_name)
        ) {
          body.session_persistence =
            after && after.type !== "APP_COOKIE" && current?.cookie_name != null
              ? { ...after, cookie_name: null }
              : after;
        }
      }
      if (!Object.keys(body).length) {
        return {
          ok: true,
          status: "success",
          data: null,
          message: "No pool changes to save.",
          scope: activeScope,
        };
      }
    }
  }

  const supported = await supportedMutationMicroversion(
    activeScope,
    protocol === "UDP" ? "2.1" : OCTAVIA_BASELINE_MICROVERSION,
    "Changing load balancer pools",
    capabilities,
  );
  if (!supported.ok) return supported.result;

  const path = "/v2/lbaas/pools";
  const operation = {
    create: {
      method: "POST",
      label: "create this pool",
      message: "Pool creation requested.",
    },
    edit: {
      method: "PUT",
      label: "update this pool",
      message: "Pool update requested.",
    },
    delete: {
      method: "DELETE",
      label: "delete this pool",
      message: "Pool deletion requested.",
    },
  } as const;
  return executeOpenStackMutation<null>({
    actionLabel: operation[value.action].label,
    scope: activeScope,
    ...OCTAVIA_SERVICE,
    path: poolId ? `${path}/${poolId}` : path,
    method: operation[value.action].method,
    apiVersion: `load-balancer ${supported.version}`,
    ...(body ? { body: { pool: body } } : {}),
    invalidates: [
      "/networking/load-balancers",
      `/networking/load-balancers/${parentId}`,
      "/quotas",
    ],
    successMessage: operation[value.action].message,
    transform: (payload) => {
      if (value.action === "delete") return null;
      const response = z
        .object({
          pool: z.object({
            id: uuidSchema,
            project_id: z.string(),
            loadbalancers: z.tuple([z.object({ id: uuidSchema })]),
          }),
        })
        .safeParse(payload);
      if (
        !response.success ||
        (poolId && response.data.pool.id !== poolId) ||
        response.data.pool.loadbalancers[0].id !== parentId ||
        normalizeProjectId(response.data.pool.project_id) !==
          normalizeProjectId(activeScope.projectId)
      ) {
        throw new Error("Octavia returned an invalid pool");
      }
      return null;
    },
  });
}

export async function mutateOctaviaPoolMemberAction(
  scope: MutationScope,
  loadBalancerId: string,
  poolId: string,
  input: OctaviaMemberMutation,
): Promise<MutationResult<null>> {
  const parent = uuidSchema.safeParse(loadBalancerId);
  const poolRef = uuidSchema.safeParse(poolId);
  const parsed = memberMutationSchema.safeParse(input);
  if (!parent.success || !poolRef.success || !parsed.success) {
    return validationFailure(
      scope,
      "Review the pool member settings and try again.",
    );
  }
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const parentId = parent.data.toLowerCase();
  const targetPoolId = poolRef.data.toLowerCase();
  const value = parsed.data;
  const capabilities = await discoverLoadBalancerCapabilities(
    activeScope.regionId!,
  );
  const existing = await readLoadBalancerForMutation(
    activeScope,
    parentId,
    capabilities,
  );
  if (!existing.ok) return existing.result;
  if (
    existing.value.id !== parentId ||
    !Array.isArray(existing.value.pools) ||
    !existing.value.pools.some((pool) => pool?.id === targetPoolId)
  ) {
    return mutationFailure(
      mutationErrorForStatus(404, "read this pool"),
      activeScope,
    );
  }
  if (!isOctaviaAmphoraProvider(existing.value.provider)) {
    return validationFailure(
      activeScope,
      "Changing pool members is not available for this provider.",
    );
  }
  if (!canChangeOctaviaListeners(existing.value))
    return pendingMutationFailure(activeScope);
  let pool: OctaviaPool;
  try {
    pool = await getLoadBalancerPool(
      parentId,
      targetPoolId,
      activeScope.regionId,
      activeScope.projectId,
    );
  } catch (error) {
    return preflightFailure(error, activeScope, "pool");
  }
  if (!canChangeOctaviaPoolMembers(pool)) {
    return mutationFailure(
      {
        code: "conflict",
        message:
          "The pool must be Active and use a supported protocol to change its members.",
        retryable: true,
      },
      activeScope,
    );
  }
  const memberId = value.action === "create" ? null : value.id.toLowerCase();
  let body: Record<string, unknown> | undefined;
  if (value.action === "create") {
    const subnetId = value.subnetId?.toLowerCase();
    if (subnetId) {
      try {
        const payload = await openstackRequest<{ subnet: { id: string } }>({
          regionId: activeScope.regionId!,
          serviceType: "network",
          serviceName: "neutron",
          path: `/v2.0/subnets/${subnetId}`,
          errorMode: "throw",
        });
        if (payload?.subnet?.id !== subnetId) {
          return validationFailure(
            activeScope,
            "The selected subnet is no longer available.",
          );
        }
      } catch (error) {
        return preflightFailure(error, activeScope, "selected subnet");
      }
    }
    body = {
      name: value.name,
      address: value.address,
      protocol_port: value.port,
      admin_state_up: value.adminStateUp,
      ...(value.weight !== undefined ? { weight: value.weight } : {}),
      ...(subnetId ? { subnet_id: subnetId } : {}),
    };
  } else {
    const id = value.id.toLowerCase();
    if (
      !Array.isArray(pool.members) ||
      !pool.members.some((ref) => ref?.id === id)
    ) {
      return mutationFailure(
        mutationErrorForStatus(404, "read this member"),
        activeScope,
      );
    }
    let member;
    try {
      member = await getOctaviaPoolMember(
        targetPoolId,
        id,
        activeScope.regionId,
        activeScope.projectId,
      );
    } catch (error) {
      return preflightFailure(error, activeScope, "pool member");
    }
    if (!canChangeOctaviaListener(member))
      return pendingMutationFailure(activeScope);
    if (value.action === "edit") {
      const currentName = member.name ?? "";
      if (
        value.source.name !== currentName ||
        value.source.adminStateUp !== member.admin_state_up ||
        (value.weight !== undefined &&
          (member.weight === undefined ||
            value.source.weight !== member.weight))
      ) {
        return mutationFailure(
          {
            code: "conflict",
            message:
              "The pool member changed or its settings could not be verified. Refresh and try again.",
            retryable: true,
          },
          activeScope,
        );
      }
      body = {
        ...(value.name !== currentName ? { name: value.name } : {}),
        ...(value.adminStateUp !== member.admin_state_up
          ? { admin_state_up: value.adminStateUp }
          : {}),
        ...(value.weight !== undefined && value.weight !== member.weight
          ? { weight: value.weight }
          : {}),
      };
      if (!Object.keys(body).length) {
        return {
          ok: true,
          status: "success",
          data: null,
          message: "No member changes to save.",
          scope: activeScope,
        };
      }
    }
  }
  const supported = await supportedMutationMicroversion(
    activeScope,
    pool.protocol === "UDP" ? "2.1" : OCTAVIA_BASELINE_MICROVERSION,
    "Changing pool members",
    capabilities,
  );
  if (!supported.ok) return supported.result;
  const operation = {
    create: {
      method: "POST",
      label: "add a pool member",
      message: "Pool member creation requested.",
    },
    edit: {
      method: "PUT",
      label: "update this pool member",
      message: "Pool member update requested.",
    },
    delete: {
      method: "DELETE",
      label: "remove this pool member",
      message: "Pool member removal requested.",
    },
  } as const;
  const path = `/v2/lbaas/pools/${targetPoolId}/members`;
  return executeOpenStackMutation<null>({
    ...OCTAVIA_SERVICE,
    scope: activeScope,
    path: memberId ? `${path}/${memberId}` : path,
    method: operation[value.action].method,
    actionLabel: operation[value.action].label,
    successMessage: operation[value.action].message,
    apiVersion: `load-balancer ${supported.version}`,
    ...(body ? { body: { member: body } } : {}),
    invalidates: [
      `/networking/load-balancers/${parentId}`,
      loadBalancerPoolPath(parentId, targetPoolId),
      "/quotas",
    ],
    transform: (payload) => {
      if (value.action === "delete") return null;
      const response = z
        .object({
          member: z.object({
            id: uuidSchema,
            project_id: z.string(),
            pool_id: uuidSchema.optional(),
          }),
        })
        .safeParse(payload);
      if (
        !response.success ||
        (memberId && response.data.member.id !== memberId) ||
        (response.data.member.pool_id !== undefined &&
          response.data.member.pool_id !== targetPoolId) ||
        normalizeProjectId(response.data.member.project_id) !==
          normalizeProjectId(activeScope.projectId)
      ) {
        throw new Error("Octavia returned an invalid pool member");
      }
      return null;
    },
  });
}

const healthMonitorMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    settings: healthMonitorSettingsSchema,
  }),
  z.object({
    action: z.literal("edit"),
    id: uuidSchema,
    settings: healthMonitorSettingsSchema,
    source: healthMonitorSnapshotSchema,
  }),
  z.object({ action: z.literal("delete"), id: uuidSchema }),
]);

export type OctaviaHealthMonitorMutation = z.input<
  typeof healthMonitorMutationSchema
>;

export async function mutateOctaviaHealthMonitorAction(
  scope: MutationScope,
  loadBalancerId: string,
  poolId: string,
  input: OctaviaHealthMonitorMutation,
): Promise<MutationResult<null>> {
  const parent = uuidSchema.safeParse(loadBalancerId);
  const poolRef = uuidSchema.safeParse(poolId);
  const parsed = healthMonitorMutationSchema.safeParse(input);
  if (!parent.success || !poolRef.success || !parsed.success) {
    return validationFailure(
      scope,
      "Review the health monitor settings and try again.",
    );
  }
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const parentId = parent.data.toLowerCase();
  const targetPoolId = poolRef.data.toLowerCase();
  const value = parsed.data;
  const capabilities = await discoverLoadBalancerCapabilities(
    activeScope.regionId!,
  );
  const existing = await readLoadBalancerForMutation(
    activeScope,
    parentId,
    capabilities,
  );
  if (!existing.ok) return existing.result;
  if (
    existing.value.id !== parentId ||
    !Array.isArray(existing.value.pools) ||
    !existing.value.pools.some((pool) => pool?.id === targetPoolId)
  ) {
    return mutationFailure(
      mutationErrorForStatus(404, "read this pool"),
      activeScope,
    );
  }
  if (!isOctaviaAmphoraProvider(existing.value.provider)) {
    return validationFailure(
      activeScope,
      "Changing health monitors is not available for this provider.",
    );
  }
  if (!canChangeOctaviaListeners(existing.value))
    return pendingMutationFailure(activeScope);

  let pool;
  try {
    pool = await getLoadBalancerPool(
      parentId,
      targetPoolId,
      activeScope.regionId,
      activeScope.projectId,
    );
  } catch (error) {
    return preflightFailure(error, activeScope, "pool");
  }
  const type = healthMonitorTypeForPool(pool);
  if (!type)
    return validationFailure(
      activeScope,
      "This pool protocol is not supported for health monitor changes.",
    );
  if (!canChangeOctaviaListeners(pool))
    return pendingMutationFailure(activeScope);

  const monitorId = value.action === "create" ? null : value.id.toLowerCase();
  let body: Record<string, unknown> | undefined;
  if (value.action === "create") {
    if (value.settings.type !== type) {
      return validationFailure(
        activeScope,
        "The check type must match the pool protocol.",
      );
    }
    if (!canChangeHealthMonitor(pool)) {
      return mutationFailure(
        {
          code: "conflict",
          message:
            "This pool already has a health monitor. Refresh to see the current settings.",
          retryable: true,
        },
        activeScope,
      );
    }
    body = { ...value.settings, pool_id: targetPoolId };
  } else {
    if (pool.healthmonitor_id !== monitorId) {
      return mutationFailure(
        mutationErrorForStatus(404, "read this health monitor"),
        activeScope,
      );
    }
    let monitor;
    try {
      monitor = await getOctaviaPoolHealthMonitor(
        targetPoolId,
        monitorId!,
        activeScope.regionId,
        activeScope.projectId,
      );
    } catch (error) {
      return preflightFailure(error, activeScope, "health monitor");
    }
    if (monitor.type !== type) {
      return validationFailure(
        activeScope,
        "Changing this type of health monitor is not supported.",
      );
    }
    if (!canChangeHealthMonitor(pool, monitor, value.action === "delete")) {
      return pendingMutationFailure(activeScope);
    }
    if (value.action === "edit") {
      const current = readHealthMonitorSettings(monitor);
      if (
        !current ||
        current.type !== value.source.type ||
        current.type !== value.settings.type ||
        Object.keys(changedHealthMonitorFields(current, value.source)).length
      ) {
        return mutationFailure(
          {
            code: "conflict",
            message:
              "The health monitor changed or its settings could not be verified. Refresh and try again.",
            retryable: true,
          },
          activeScope,
        );
      }
      body = changedHealthMonitorFields(current, value.settings);
      if (!Object.keys(body).length) {
        return {
          ok: true,
          status: "success",
          data: null,
          message: "No health monitor changes to save.",
          scope: activeScope,
        };
      }
    }
  }
  const supported = await supportedMutationMicroversion(
    activeScope,
    OCTAVIA_BASELINE_MICROVERSION,
    "Changing health monitors",
    capabilities,
  );
  if (!supported.ok) return supported.result;
  const operation = {
    create: {
      method: "POST",
      label: "create a health monitor",
      message: "Health monitor creation requested.",
    },
    edit: {
      method: "PUT",
      label: "update this health monitor",
      message: "Health monitor update requested.",
    },
    delete: {
      method: "DELETE",
      label: "delete this health monitor",
      message: "Health monitor deletion requested.",
    },
  } as const;
  const path = "/v2/lbaas/healthmonitors";
  return executeOpenStackMutation<null>({
    ...OCTAVIA_SERVICE,
    scope: activeScope,
    path: monitorId ? `${path}/${monitorId}` : path,
    method: operation[value.action].method,
    actionLabel: operation[value.action].label,
    successMessage: operation[value.action].message,
    apiVersion: `load-balancer ${supported.version}`,
    ...(body ? { body: { healthmonitor: body } } : {}),
    invalidates: [
      `/networking/load-balancers/${parentId}`,
      loadBalancerPoolPath(parentId, targetPoolId),
      "/quotas",
    ],
    transform: (payload) => {
      if (value.action === "delete") return null;
      const response = z
        .object({
          healthmonitor: z.object({
            id: uuidSchema,
            project_id: z.string(),
            pools: z.tuple([z.object({ id: uuidSchema })]),
            type: z.literal(type),
          }),
        })
        .safeParse(payload);
      if (
        !response.success ||
        (monitorId && response.data.healthmonitor.id !== monitorId) ||
        response.data.healthmonitor.pools[0].id !== targetPoolId ||
        normalizeProjectId(response.data.healthmonitor.project_id) !==
          normalizeProjectId(activeScope.projectId)
      ) {
        throw new Error("Octavia returned an invalid health monitor");
      }
      return null;
    },
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

export async function listLoadBalancerPoolChoicesAction(
  id: string,
  regionId?: string,
  projectId?: string,
) {
  return listLoadBalancerPoolChoices(id, regionId, projectId);
}

export async function getLoadBalancerPoolDetailsAction(
  loadBalancerId: string,
  poolId: string,
  regionId?: string,
  projectId?: string,
) {
  return getLoadBalancerPoolDetails(
    loadBalancerId,
    poolId,
    regionId,
    projectId,
  );
}

export async function getLoadBalancerDetailsAction(
  id: string,
  regionId?: string,
  projectId?: string,
): Promise<OctaviaLoadBalancerDetails> {
  return getLoadBalancerDetails(id, regionId, projectId);
}

export async function getLoadBalancerListenerDetailsAction(
  loadBalancerId: string,
  listenerId: string,
  regionId?: string,
  projectId?: string,
) {
  return getLoadBalancerListenerDetails(
    loadBalancerId,
    listenerId,
    regionId,
    projectId,
  );
}

export async function listLoadBalancerFloatingIpsAction(
  portId: string,
  regionId?: string,
  projectId?: string,
): Promise<NeutronFloatingIpReference[]> {
  return listFloatingIpsForPort(portId, regionId, projectId);
}

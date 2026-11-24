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
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  getLoadBalancerDetails,
  listLoadBalancerAvailabilityZones,
  listLoadBalancers,
} from "@/lib/openstack/octavia-server";
import { validateOctaviaTags } from "@/lib/openstack/octavia-tags";
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

export type CreateLoadBalancerInput = z.input<typeof createLoadBalancerSchema>;

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
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
  const capabilities = await discoverLoadBalancerCapabilities(
    activeScope.regionId!,
  );
  const support = microversionSupport(
    capabilities,
    requiredMicroversion,
    "Creating this load balancer",
  );
  if (support.status === "unsupported") {
    return mutationFailure(
      {
        code: "service-unavailable",
        message: support.message,
        retryable: false,
      },
      activeScope,
    );
  }
  const requestedMicroversion =
    support.requestedMicroversion ?? requiredMicroversion;

  return executeOpenStackMutation<OctaviaLoadBalancer>({
    actionLabel: "create a load balancer",
    scope: activeScope,
    ...OCTAVIA_SERVICE,
    path: "/v2/lbaas/loadbalancers",
    method: "POST",
    apiVersion: `load-balancer ${requestedMicroversion}`,
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
    transform: (payload) => {
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        !("loadbalancer" in payload)
      ) {
        throw new Error("Octavia did not return the created load balancer");
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
        typeof record.project_id !== "string" ||
        record.project_id.replaceAll("-", "").toLowerCase() !==
          activeScope.projectId.replaceAll("-", "").toLowerCase()
      ) {
        throw new Error("Octavia returned an invalid load balancer");
      }
      return loadBalancer as OctaviaLoadBalancer;
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

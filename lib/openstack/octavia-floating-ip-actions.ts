"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationErrorForStatus,
  mutationFailure,
  normalizeMutationProjectId,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import {
  discoverNetworkCapabilities,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION,
  NEUTRON_REVISION_IF_MATCH_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import { listUnassociatedFloatingIps } from "@/lib/openstack/neutron-floating-ip-server";
import {
  canChangeOctaviaListener,
  canChangeOctaviaListeners,
  isOctaviaAmphoraProvider,
} from "@/lib/openstack/octavia";
import { getLoadBalancer } from "@/lib/openstack/octavia-server";
import { OpenStackRequestError } from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";

const neutron = { serviceType: "network", serviceName: "neutron" } as const;
const uuid = z.uuid().toLowerCase();
const inputSchema = z.object({
  action: z.enum(["associate", "disassociate"]),
  floatingIpId: uuid,
  vipPortId: uuid,
  vipAddress: z.ipv4(),
});
const floatingIpResponse = z.object({
  floatingip: z.object({
    id: uuid,
    project_id: z.string().min(1).optional(),
    tenant_id: z.string().min(1).optional(),
    floating_ip_address: z.ipv4(),
    port_id: uuid.nullable(),
    fixed_ip_address: z.ipv4().nullable(),
    router_id: uuid.nullable().optional(),
    revision_number: z.number().int().nonnegative().optional(),
    port_forwardings: z.array(z.unknown()).optional(),
  }),
});

export type OctaviaFloatingIpAssociation = z.input<typeof inputSchema>;

export async function listOctaviaFloatingIpChoicesAction(
  regionId: string,
  projectId: string,
) {
  return listUnassociatedFloatingIps(regionId, projectId);
}

function conflict(scope: MutationScope, message: string) {
  return mutationFailure({ code: "conflict", message, retryable: true }, scope);
}

function matchesScope(
  floatingIp: z.infer<typeof floatingIpResponse>["floatingip"],
  id: string,
  projectId: string,
) {
  return (
    floatingIp.id === id &&
    normalizeMutationProjectId(
      floatingIp.project_id ?? floatingIp.tenant_id,
    ) === normalizeMutationProjectId(projectId)
  );
}

export async function changeOctaviaFloatingIpAssociationAction(
  scope: MutationScope,
  loadBalancerId: string,
  input: OctaviaFloatingIpAssociation,
): Promise<MutationResult<null>> {
  const parent = uuid.safeParse(loadBalancerId);
  const parsed = inputSchema.safeParse(input);
  if (!parent.success || !parsed.success) {
    return mutationFailure(
      {
        code: "validation-failed",
        message:
          "Select a floating IP and a load balancer with a primary IPv4 VIP.",
        retryable: false,
      },
      scope,
    );
  }
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const active = guarded.context.scope;
  const { projectId, regionId } = active;
  const { action, floatingIpId, vipPortId, vipAddress } = parsed.data;
  const associating = action === "associate";
  const actionLabel = associating
    ? "associate this floating IP"
    : "disassociate this floating IP";
  const path = `/v2.0/floatingips/${floatingIpId}`;
  let revision: number;
  let address: string;
  try {
    const loadBalancer = await getLoadBalancer(
      parent.data,
      regionId,
      projectId,
    );
    if (loadBalancer.id !== parent.data) {
      return mutationFailure(
        mutationErrorForStatus(404, "read this load balancer"),
        active,
      );
    }
    if (!isOctaviaAmphoraProvider(loadBalancer.provider)) {
      return mutationFailure(
        {
          code: "service-unavailable",
          message:
            "Changing floating IPs is not supported for this load balancer provider.",
          retryable: false,
        },
        active,
      );
    }
    if (
      loadBalancer.vip_port_id !== vipPortId ||
      loadBalancer.vip_address !== vipAddress
    ) {
      return conflict(
        active,
        "The load balancer VIP changed. Refresh before changing its floating IPs.",
      );
    }
    if (
      !(associating
        ? canChangeOctaviaListeners(loadBalancer)
        : canChangeOctaviaListener(loadBalancer))
    ) {
      return conflict(
        active,
        "Wait for the load balancer operation to finish.",
      );
    }

    const capabilities = await discoverNetworkCapabilities(regionId!);
    const extensions =
      capabilities.discoveryStatus === "available"
        ? capabilities.extensions
        : undefined;
    if (!extensions?.includes(NEUTRON_REVISION_IF_MATCH_EXTENSION)) {
      return mutationFailure(
        {
          code: "service-unavailable",
          message:
            "Neutron revision preconditions could not be verified. Floating IP associations are read-only.",
          retryable: false,
        },
        active,
      );
    }
    const read = (path: string) =>
      openstackRequest<unknown>({
        ...neutron,
        regionId: regionId!,
        path,
        errorMode: "throw",
      });
    const response = floatingIpResponse.safeParse(await read(path));
    if (!response.success) throw new Error("Invalid floating IP response");
    const current = response.data.floatingip;
    if (!matchesScope(current, floatingIpId, projectId)) {
      return mutationFailure(
        mutationErrorForStatus(404, "read this floating IP"),
        active,
      );
    }
    if (current.revision_number === undefined) {
      return conflict(
        active,
        "Neutron did not report a revision for this floating IP.",
      );
    }
    if (associating) {
      if (
        current.port_id !== null ||
        current.fixed_ip_address !== null ||
        current.router_id !== null
      ) {
        return conflict(
          active,
          "This floating IP is no longer unassociated. Select a different address.",
        );
      }
      let forwardings = current.port_forwardings;
      if (
        forwardings === undefined &&
        extensions.includes(NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION)
      ) {
        const result = z
          .object({ port_forwardings: z.array(z.unknown()) })
          .safeParse(await read(`${path}/port_forwardings?limit=1`));
        if (!result.success)
          throw new Error("Invalid floating IP port-forwarding response");
        forwardings = result.data.port_forwardings;
      }
      if (forwardings?.length) {
        return conflict(
          active,
          "This floating IP has port forwarding rules. Select a different address.",
        );
      }
    } else if (
      current.port_id !== vipPortId ||
      current.fixed_ip_address !== vipAddress
    ) {
      return conflict(
        active,
        "This floating IP is no longer associated with the primary VIP.",
      );
    }
    revision = current.revision_number;
    address = current.floating_ip_address;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof OpenStackRequestError) {
      return mutationFailure(
        mutationErrorForStatus(error.status, actionLabel),
        active,
      );
    }
    return mutationFailure(
      {
        code: "service-error",
        message:
          "The floating IP association could not be verified. No update was sent.",
        retryable: true,
      },
      active,
    );
  }
  const association = associating
    ? { port_id: vipPortId, fixed_ip_address: vipAddress }
    : { port_id: null };
  const result = await executeOpenStackMutation<null>({
    ...neutron,
    scope: active,
    method: "PUT",
    path,
    headers: { "If-Match": `"revision_number=${revision}"` },
    body: { floatingip: association },
    actionLabel,
    successMessage: associating
      ? "Floating IP associated."
      : "Floating IP disassociated.",
    invalidates: [
      `/networking/load-balancers/${parent.data}`,
      "/networking/floating-ips",
      `/networking/floating-ips/${floatingIpId}`,
      "/networking/topology",
      "/kubernetes",
    ],
    transform: (payload) => {
      const result = floatingIpResponse.safeParse(payload);
      if (
        !result.success ||
        !matchesScope(result.data.floatingip, floatingIpId, projectId) ||
        result.data.floatingip.floating_ip_address !== address ||
        result.data.floatingip.port_id !== association.port_id ||
        result.data.floatingip.fixed_ip_address !==
          (associating ? vipAddress : null)
      )
        throw new Error(
          "Neutron returned an unexpected floating IP association",
        );
      return null;
    },
  });
  if (!result.ok && result.error.status === 401) redirect("/auth/refresh");
  return result;
}

"use server";

import { isIP } from "node:net";
import { z } from "zod";

import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationFailure,
  normalizeMutationProjectId,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_DESCRIPTION_EXTENSION,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_PORT_RANGES_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  buildPortForwardingPortMapping,
  NEUTRON_PORT_FORWARDING_PROTOCOLS,
} from "@/lib/openstack/neutron-port-forwarding";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession } from "@/lib/session";
import type {
  FloatingIp,
  FloatingIpPortForwarding,
  Network,
  Port,
} from "@/types/openstack";

const SERVICE_TYPE = "network";
const SERVICE_NAME = "neutron";
const resourceId = z.string().trim().min(1).max(255);
const portNumber = z.number().int().min(1).max(65_535);
const portForwardingInputSchema = z.object({
  description: z.string().trim().max(1024).optional(),
  externalPortEnd: portNumber.optional(),
  externalPortStart: portNumber,
  internalIpAddress: z
    .string()
    .trim()
    .max(64)
    .refine((value) => isIP(value) === 4, "Select a fixed IPv4 address."),
  internalPortEnd: portNumber.optional(),
  internalPortId: resourceId,
  internalPortStart: portNumber,
  protocol: z.enum(NEUTRON_PORT_FORWARDING_PROTOCOLS),
});

export type FloatingIpPortForwardingInput = z.input<
  typeof portForwardingInputSchema
>;

type ScopedResource<T> =
  { ok: true; value: T } | { ok: false; result: MutationResult<never> };

function validResourceId(value: string) {
  return Boolean(value) && value.length <= 255 && !/[\r\n]/.test(value);
}

function projectOwnsResource(
  resource: { project_id?: string; tenant_id?: string },
  projectId: string,
) {
  const owner = resource.project_id || resource.tenant_id;
  return (
    Boolean(owner) &&
    normalizeMutationProjectId(owner) === normalizeMutationProjectId(projectId)
  );
}

function validationFailure(message: string, scope: MutationScope) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function permissionFailure(message: string, scope: MutationScope) {
  return mutationFailure(
    { code: "permission-denied", message, retryable: false },
    scope,
  );
}

function serviceFailure(message: string, scope: MutationScope) {
  return mutationFailure(
    { code: "service-error", message, retryable: true },
    scope,
  );
}

function parseFloatingIp(payload: unknown): FloatingIp | null {
  if (!payload || typeof payload !== "object") return null;
  const floatingIp = Reflect.get(payload, "floatingip");
  return floatingIp &&
    typeof floatingIp === "object" &&
    typeof Reflect.get(floatingIp, "id") === "string"
    ? (floatingIp as FloatingIp)
    : null;
}

function parsePort(payload: unknown): Port | null {
  if (!payload || typeof payload !== "object") return null;
  const port = Reflect.get(payload, "port");
  return port &&
    typeof port === "object" &&
    typeof Reflect.get(port, "id") === "string" &&
    typeof Reflect.get(port, "network_id") === "string" &&
    Array.isArray(Reflect.get(port, "fixed_ips"))
    ? (port as Port)
    : null;
}

function parseNetwork(payload: unknown): Network | null {
  if (!payload || typeof payload !== "object") return null;
  const network = Reflect.get(payload, "network");
  return network &&
    typeof network === "object" &&
    typeof Reflect.get(network, "id") === "string"
    ? (network as Network)
    : null;
}

function parsePortForwarding(value: unknown): FloatingIpPortForwarding {
  if (
    !value ||
    typeof value !== "object" ||
    typeof Reflect.get(value, "id") !== "string" ||
    typeof Reflect.get(value, "internal_port_id") !== "string" ||
    typeof Reflect.get(value, "internal_ip_address") !== "string" ||
    typeof Reflect.get(value, "protocol") !== "string"
  ) {
    throw new Error("Invalid Neutron floating IP port forwarding response");
  }
  return value as FloatingIpPortForwarding;
}

function parsePortForwardingResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Neutron floating IP port forwarding response");
  }
  return parsePortForwarding(Reflect.get(payload, "port_forwarding"));
}

function parsePortForwardingCollection(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Neutron floating IP port forwarding response");
  }
  const values = Reflect.get(payload, "port_forwardings");
  if (!Array.isArray(values)) {
    throw new Error("Invalid Neutron floating IP port forwarding response");
  }
  return values.map(parsePortForwarding);
}

async function requestFloatingIp(regionId: string, floatingIpId: string) {
  const payload = await openstackRequest<unknown>({
    regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/v2.0/floatingips/${encodeURIComponent(floatingIpId)}`,
  });
  return parseFloatingIp(payload);
}

async function requestPort(regionId: string, portId: string) {
  const payload = await openstackRequest<unknown>({
    regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/v2.0/ports/${encodeURIComponent(portId)}`,
  });
  return parsePort(payload);
}

async function requestNetwork(regionId: string, networkId: string) {
  const payload = await openstackRequest<unknown>({
    regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/v2.0/networks/${encodeURIComponent(networkId)}`,
  });
  return parseNetwork(payload);
}

async function validateParent(
  regionId: string,
  projectId: string,
  floatingIpId: string,
  scope: MutationScope,
): Promise<ScopedResource<FloatingIp>> {
  const floatingIp = await requestFloatingIp(regionId, floatingIpId);
  if (!floatingIp) {
    return {
      ok: false,
      result: serviceFailure(
        "Sunrise could not verify the floating IP before changing its forwarding rules.",
        scope,
      ),
    };
  }
  if (!projectOwnsResource(floatingIp, projectId)) {
    return {
      ok: false,
      result: permissionFailure(
        "Port forwarding can only be changed on floating IPs owned by the active project.",
        scope,
      ),
    };
  }
  if (floatingIp.port_id) {
    return {
      ok: false,
      result: validationFailure(
        "Disassociate this floating IP before adding or changing port forwarding rules.",
        scope,
      ),
    };
  }
  return { ok: true, value: floatingIp };
}

async function validateTarget(
  regionId: string,
  projectId: string,
  portId: string,
  ipAddress: string,
  scope: MutationScope,
): Promise<ScopedResource<Port>> {
  const port = await requestPort(regionId, portId);
  if (!port) {
    return {
      ok: false,
      result: serviceFailure(
        "Sunrise could not verify the internal port before changing this forwarding rule.",
        scope,
      ),
    };
  }
  if (!projectOwnsResource(port, projectId)) {
    return {
      ok: false,
      result: permissionFailure(
        "Select an internal port owned by the active project.",
        scope,
      ),
    };
  }
  if (
    !port.fixed_ips.some(
      (fixedIp) =>
        fixedIp.ip_address === ipAddress && isIP(fixedIp.ip_address) === 4,
    )
  ) {
    return {
      ok: false,
      result: validationFailure(
        "Select a fixed IPv4 address assigned to the internal port.",
        scope,
      ),
    };
  }
  const network = await requestNetwork(regionId, port.network_id);
  if (!network) {
    return {
      ok: false,
      result: serviceFailure(
        "Sunrise could not verify the internal network before changing this forwarding rule.",
        scope,
      ),
    };
  }
  if (network["router:external"]) {
    return {
      ok: false,
      result: validationFailure(
        "Select a port on an internal network for the forwarding target.",
        scope,
      ),
    };
  }
  return { ok: true, value: port };
}

async function resolveReadScope(regionId: string, projectId: string) {
  const session = await getSession();
  if (!session.regionId || !session.projectId) {
    throw new Error("No active project scope for Neutron request");
  }
  if (session.regionId.toLowerCase() !== regionId.toLowerCase()) {
    throw new Error("Neutron region does not match the active session");
  }
  if (
    normalizeMutationProjectId(session.projectId) !==
    normalizeMutationProjectId(projectId)
  ) {
    throw new Error("Neutron project does not match the active session");
  }
  return { projectId: session.projectId, regionId: session.regionId };
}

export async function listProjectFloatingIpPortForwardings(
  regionId: string,
  projectId: string,
  floatingIpId: string,
) {
  if (!validResourceId(floatingIpId)) {
    throw new Error("Invalid Neutron floating IP ID");
  }
  const scope = await resolveReadScope(regionId, projectId);
  const floatingIp = await requestFloatingIp(scope.regionId, floatingIpId);
  if (!floatingIp || !projectOwnsResource(floatingIp, scope.projectId)) {
    throw new Error("Floating IP was not found in the active project");
  }
  const payload = await openstackRequest<unknown>({
    regionId: scope.regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/v2.0/floatingips/${encodeURIComponent(floatingIpId)}/port_forwardings`,
    errorMode: "throw",
  });
  return parsePortForwardingCollection(payload);
}

async function prepareMutation(
  expectedScope: MutationScope,
  floatingIpId: string,
  input: FloatingIpPortForwardingInput,
  portForwardingId?: string,
) {
  const guarded = await guardMutationContext(expectedScope);
  if (!guarded.ok) return guarded;
  const scope = guarded.context.scope;
  const parsedId = resourceId.safeParse(floatingIpId);
  const parsedRuleId =
    portForwardingId !== undefined
      ? resourceId.safeParse(portForwardingId)
      : null;
  const parsedInput = portForwardingInputSchema.safeParse(input);
  if (
    !parsedId.success ||
    (parsedRuleId !== null && !parsedRuleId.success) ||
    !parsedInput.success
  ) {
    return {
      ok: false as const,
      result: validationFailure(
        parsedRuleId !== null && !parsedRuleId.success
          ? "Select a valid port forwarding rule."
          : (parsedInput.error?.issues[0]?.message ??
              "Review the forwarding rule values and try again."),
        scope,
      ),
    };
  }

  const capabilities = await discoverNetworkCapabilities(scope.regionId!);
  const baseSupport = extensionSupport(
    capabilities,
    NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION,
    "Floating IP port forwarding",
  );
  if (baseSupport.status === "unsupported") {
    return {
      ok: false as const,
      result: mutationFailure(
        {
          code: "service-unavailable",
          message: baseSupport.message,
          retryable: false,
        },
        scope,
      ),
    };
  }

  const mapping = buildPortForwardingPortMapping({
    externalEnd: parsedInput.data.externalPortEnd,
    externalStart: parsedInput.data.externalPortStart,
    internalEnd: parsedInput.data.internalPortEnd,
    internalStart: parsedInput.data.internalPortStart,
  });
  if (!mapping.ok) {
    return {
      ok: false as const,
      result: validationFailure(mapping.error, scope),
    };
  }
  const rangeSupport = extensionSupport(
    capabilities,
    NEUTRON_FLOATING_IP_PORT_FORWARDING_PORT_RANGES_EXTENSION,
    "Floating IP port forwarding ranges",
  );
  if (
    mapping.value.externalPortRange &&
    rangeSupport.status === "unsupported"
  ) {
    return {
      ok: false as const,
      result: mutationFailure(
        {
          code: "service-unavailable",
          message: rangeSupport.message,
          retryable: false,
        },
        scope,
      ),
    };
  }
  const descriptionSupport = extensionSupport(
    capabilities,
    NEUTRON_FLOATING_IP_PORT_FORWARDING_DESCRIPTION_EXTENSION,
    "Floating IP port forwarding descriptions",
  );
  if (
    parsedInput.data.description !== undefined &&
    descriptionSupport.status === "unsupported"
  ) {
    return {
      ok: false as const,
      result: mutationFailure(
        {
          code: "service-unavailable",
          message: descriptionSupport.message,
          retryable: false,
        },
        scope,
      ),
    };
  }

  const parent = await validateParent(
    scope.regionId!,
    scope.projectId,
    parsedId.data,
    scope,
  );
  if (!parent.ok) return { ok: false as const, result: parent.result };
  const target = await validateTarget(
    scope.regionId!,
    scope.projectId,
    parsedInput.data.internalPortId,
    parsedInput.data.internalIpAddress,
    scope,
  );
  if (!target.ok) return { ok: false as const, result: target.result };

  const body: Record<string, unknown> = {
    internal_port_id: parsedInput.data.internalPortId,
    internal_ip_address: parsedInput.data.internalIpAddress,
    protocol: parsedInput.data.protocol,
  };
  if (mapping.value.externalPort !== undefined) {
    body.external_port = mapping.value.externalPort;
    body.internal_port = mapping.value.internalPort;
  } else {
    body.external_port_range = mapping.value.externalPortRange;
    body.internal_port_range = mapping.value.internalPortRange;
  }
  if (parsedInput.data.description !== undefined) {
    body.description = parsedInput.data.description;
  }

  return {
    ok: true as const,
    body: { port_forwarding: body },
    floatingIpId: parsedId.data,
    portForwardingId: parsedRuleId?.data,
    scope,
  };
}

export async function createFloatingIpPortForwardingAction(
  scope: MutationScope,
  floatingIpId: string,
  input: FloatingIpPortForwardingInput,
): Promise<MutationResult<FloatingIpPortForwarding>> {
  const prepared = await prepareMutation(scope, floatingIpId, input);
  if (!prepared.ok) return prepared.result;
  return executeOpenStackMutation<FloatingIpPortForwarding>({
    actionLabel: "create the floating IP port forwarding rule",
    body: prepared.body,
    invalidates: [
      "/networking/floating-ips",
      `/networking/floating-ips/${prepared.floatingIpId}`,
    ],
    method: "POST",
    path: `/v2.0/floatingips/${encodeURIComponent(prepared.floatingIpId)}/port_forwardings`,
    scope: prepared.scope,
    serviceName: SERVICE_NAME,
    serviceType: SERVICE_TYPE,
    successMessage: "Port forwarding rule created.",
    transform: parsePortForwardingResponse,
  });
}

export async function updateFloatingIpPortForwardingAction(
  scope: MutationScope,
  floatingIpId: string,
  portForwardingId: string,
  input: FloatingIpPortForwardingInput,
): Promise<MutationResult<FloatingIpPortForwarding>> {
  const prepared = await prepareMutation(
    scope,
    floatingIpId,
    input,
    portForwardingId,
  );
  if (!prepared.ok) return prepared.result;
  // Neutron declares protocol and both external port forms allow_put. Sending
  // the complete mapping also lets Neutron run its collision checks atomically.
  return executeOpenStackMutation<FloatingIpPortForwarding>({
    actionLabel: "update the floating IP port forwarding rule",
    body: prepared.body,
    invalidates: [
      "/networking/floating-ips",
      `/networking/floating-ips/${prepared.floatingIpId}`,
    ],
    method: "PUT",
    path: `/v2.0/floatingips/${encodeURIComponent(prepared.floatingIpId)}/port_forwardings/${encodeURIComponent(prepared.portForwardingId!)}`,
    scope: prepared.scope,
    serviceName: SERVICE_NAME,
    serviceType: SERVICE_TYPE,
    successMessage: "Port forwarding rule updated.",
    transform: parsePortForwardingResponse,
  });
}

export async function deleteFloatingIpPortForwardingAction(
  scope: MutationScope,
  floatingIpId: string,
  portForwardingId: string,
): Promise<MutationResult<null>> {
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const parsedFloatingIpId = resourceId.safeParse(floatingIpId);
  const parsedRuleId = resourceId.safeParse(portForwardingId);
  if (!parsedFloatingIpId.success || !parsedRuleId.success) {
    return validationFailure(
      "Select a valid port forwarding rule.",
      activeScope,
    );
  }
  const capabilities = await discoverNetworkCapabilities(activeScope.regionId!);
  const support = extensionSupport(
    capabilities,
    NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION,
    "Floating IP port forwarding",
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
  const parent = await validateParent(
    activeScope.regionId!,
    activeScope.projectId,
    parsedFloatingIpId.data,
    activeScope,
  );
  if (!parent.ok) return parent.result;

  return executeOpenStackMutation<null>({
    actionLabel: "delete the floating IP port forwarding rule",
    invalidates: [
      "/networking/floating-ips",
      `/networking/floating-ips/${parsedFloatingIpId.data}`,
    ],
    method: "DELETE",
    path: `/v2.0/floatingips/${encodeURIComponent(parsedFloatingIpId.data)}/port_forwardings/${encodeURIComponent(parsedRuleId.data)}`,
    scope: activeScope,
    serviceName: SERVICE_NAME,
    serviceType: SERVICE_TYPE,
    successMessage: "Port forwarding rule deleted.",
  });
}

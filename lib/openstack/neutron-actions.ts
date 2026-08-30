"use server";

import { isIP } from "node:net";
import { z } from "zod";

import {
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import type {
  FloatingIp,
  Network,
  Port,
  Router,
  SecurityGroup,
  SecurityGroupRule,
  Subnet,
} from "@/types/openstack";

const NEUTRON_SERVICE = {
  serviceType: "network",
  serviceName: "neutron",
} as const;

const resourceId = z.string().trim().min(1).max(255);
const name = z.string().trim().min(1).max(255);
const description = z.string().trim().max(1024).default("");
function isCidr(value: string) {
  const [address, prefix, ...rest] = value.split("/");
  const version = isIP(address ?? "");
  if (!version || rest.length || prefix === undefined || !/^\d+$/.test(prefix))
    return false;
  const prefixLength = Number(prefix);
  return prefixLength >= 0 && prefixLength <= (version === 4 ? 32 : 128);
}
const cidr = z
  .string()
  .trim()
  .max(64)
  .refine(isCidr, "Enter a valid CIDR, such as 10.0.0.0/24.");
const ipAddress = z
  .string()
  .trim()
  .max(64)
  .refine((value) => isIP(value) !== 0, "Enter a valid IP address.");
const optionalIpAddress = ipAddress.optional();
const allocationPools = z
  .array(z.object({ start: ipAddress, end: ipAddress }))
  .max(32)
  .optional();
const dnsNameservers = z.array(ipAddress).max(16).optional();

const networkCreateSchema = z.object({
  name,
  description,
  adminStateUp: z.boolean().default(true),
  portSecurityEnabled: z.boolean().default(true),
});
const networkUpdateSchema = networkCreateSchema;
const subnetCreateSchema = z.object({
  networkId: resourceId,
  name,
  description,
  cidr: z.string().trim().min(3).max(64),
  ipVersion: z.union([z.literal(4), z.literal(6)]),
  gatewayIp: optionalIpAddress,
  enableDhcp: z.boolean().default(true),
  allocationPools,
  dnsNameservers,
});
const subnetUpdateSchema = z.object({
  name,
  description,
  gatewayIp: optionalIpAddress,
  enableDhcp: z.boolean(),
  allocationPools,
  dnsNameservers,
});
const routerCreateSchema = z.object({
  name,
  description,
  adminStateUp: z.boolean().default(true),
});
const routerRouteSchema = z.object({
  destination: cidr,
  nexthop: ipAddress,
});
const routerGatewaySchema = z.object({
  networkId: resourceId,
  enableSnat: z.boolean().default(true),
});
const routerInterfaceSchema = z.object({ subnetId: resourceId });
const portCreateSchema = z.object({
  name,
  description,
  networkId: resourceId,
  adminStateUp: z.boolean().default(true),
  portSecurityEnabled: z.boolean().default(true),
  securityGroupIds: z.array(resourceId).default([]),
});
const portUpdateSchema = z.object({
  name,
  description,
  adminStateUp: z.boolean(),
  portSecurityEnabled: z.boolean(),
  securityGroupIds: z.array(resourceId),
});
const floatingIpCreateSchema = z.object({
  floatingNetworkId: resourceId,
  description,
  portId: resourceId.optional(),
  fixedIpAddress: optionalIpAddress,
});
const floatingIpUpdateSchema = z.object({
  description,
  portId: resourceId.optional().nullable(),
  fixedIpAddress: optionalIpAddress.nullable(),
});
const securityGroupCreateSchema = z.object({ name, description });
const securityGroupRuleCreateSchema = z.object({
  securityGroupId: resourceId,
  description,
  direction: z.enum(["ingress", "egress"]),
  ethertype: z.enum(["IPv4", "IPv6"]),
  protocol: z.string().trim().max(32).optional(),
  portRangeMin: z.coerce.number().int().min(1).max(65535).optional(),
  portRangeMax: z.coerce.number().int().min(1).max(65535).optional(),
  remoteIpPrefix: z.string().trim().max(64).optional(),
  remoteGroupId: resourceId.optional(),
});

export type CreateNetworkInput = z.input<typeof networkCreateSchema>;
export type UpdateNetworkInput = z.input<typeof networkUpdateSchema>;
export type CreateSubnetInput = z.input<typeof subnetCreateSchema>;
export type UpdateSubnetInput = z.input<typeof subnetUpdateSchema>;
export type CreateRouterInput = z.input<typeof routerCreateSchema>;
export type UpdateRouterInput = z.input<typeof routerCreateSchema>;
export type SetRouterGatewayInput = z.input<typeof routerGatewaySchema>;
export type RouterRouteInput = z.input<typeof routerRouteSchema>;
export type CreatePortInput = z.input<typeof portCreateSchema>;
export type UpdatePortInput = z.input<typeof portUpdateSchema>;
export type CreateFloatingIpInput = z.input<typeof floatingIpCreateSchema>;
export type UpdateFloatingIpInput = z.input<typeof floatingIpUpdateSchema>;
export type CreateSecurityGroupInput = z.input<
  typeof securityGroupCreateSchema
>;
export type UpdateSecurityGroupInput = z.input<
  typeof securityGroupCreateSchema
>;
export type CreateSecurityGroupRuleInput = z.input<
  typeof securityGroupRuleCreateSchema
>;
type SecurityGroupRuleValue = z.output<typeof securityGroupRuleCreateSchema>;

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function parse<T>(schema: z.ZodType<T>, input: unknown, scope: MutationScope) {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? ({ ok: true, value: parsed.data } as const)
    : ({
        ok: false,
        result: validationFailure(
          scope,
          parsed.error.issues[0]?.message ?? "Review the values and try again.",
        ),
      } as const);
}

function parseId(scope: MutationScope, id: string) {
  return parse(resourceId, id, scope);
}

function transformResource<T>(key: string) {
  return (payload: unknown) => {
    if (!payload || typeof payload !== "object" || !(key in payload)) {
      throw new Error(`Neutron did not return ${key}`);
    }
    return (payload as Record<string, unknown>)[key] as T;
  };
}

const networkingInvalidates = ["/compute", "/compute/networks"];

export async function createNetworkAction(
  scope: MutationScope,
  input: CreateNetworkInput,
): Promise<MutationResult<Network>> {
  const parsed = parse(networkCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "create a network",
    scope,
    ...NEUTRON_SERVICE,
    path: "/v2.0/networks",
    method: "POST",
    body: {
      network: {
        name: value.name,
        description: value.description,
        admin_state_up: value.adminStateUp,
        port_security_enabled: value.portSecurityEnabled,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: `Network ${value.name} created.`,
    transform: transformResource<Network>("network"),
  });
}

export async function updateNetworkAction(
  scope: MutationScope,
  id: string,
  input: UpdateNetworkInput,
): Promise<MutationResult<Network>> {
  const parsedId = parseId(scope, id);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(networkUpdateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "edit this network",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/networks/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    body: {
      network: {
        name: value.name,
        description: value.description,
        admin_state_up: value.adminStateUp,
        port_security_enabled: value.portSecurityEnabled,
      },
    },
    invalidates: [
      ...networkingInvalidates,
      `/compute/networks/${parsedId.value}`,
    ],
    successMessage: "Network updated.",
    transform: transformResource<Network>("network"),
  });
}

export async function deleteNetworkAction(scope: MutationScope, id: string) {
  const parsed = parseId(scope, id);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "delete this network",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/networks/${encodeURIComponent(parsed.value)}`,
    method: "DELETE",
    invalidates: [],
    successMessage: "Network deleted.",
  });
}

export async function createSubnetAction(
  scope: MutationScope,
  input: CreateSubnetInput,
): Promise<MutationResult<Subnet>> {
  const parsed = parse(subnetCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "create a subnet",
    scope,
    ...NEUTRON_SERVICE,
    path: "/v2.0/subnets",
    method: "POST",
    body: {
      subnet: {
        network_id: value.networkId,
        name: value.name,
        description: value.description,
        cidr: value.cidr,
        ip_version: value.ipVersion,
        gateway_ip: value.gatewayIp || undefined,
        enable_dhcp: value.enableDhcp,
        allocation_pools: value.allocationPools,
        dns_nameservers: value.dnsNameservers,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: `Subnet ${value.name} created.`,
    transform: transformResource<Subnet>("subnet"),
  });
}

export async function updateSubnetAction(
  scope: MutationScope,
  id: string,
  input: UpdateSubnetInput,
): Promise<MutationResult<Subnet>> {
  const parsedId = parseId(scope, id);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(subnetUpdateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "edit this subnet",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/subnets/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    body: {
      subnet: {
        name: value.name,
        description: value.description,
        gateway_ip: value.gatewayIp || null,
        enable_dhcp: value.enableDhcp,
        allocation_pools: value.allocationPools,
        dns_nameservers: value.dnsNameservers,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: "Subnet updated.",
    transform: transformResource<Subnet>("subnet"),
  });
}

export async function deleteSubnetAction(scope: MutationScope, id: string) {
  const parsed = parseId(scope, id);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "delete this subnet",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/subnets/${encodeURIComponent(parsed.value)}`,
    method: "DELETE",
    invalidates: networkingInvalidates,
    successMessage: "Subnet deleted.",
  });
}

export async function createRouterAction(
  scope: MutationScope,
  input: CreateRouterInput,
): Promise<MutationResult<Router>> {
  const parsed = parse(routerCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "create a router",
    scope,
    ...NEUTRON_SERVICE,
    path: "/v2.0/routers",
    method: "POST",
    body: {
      router: {
        name: value.name,
        description: value.description,
        admin_state_up: value.adminStateUp,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: `Router ${value.name} created.`,
    transform: transformResource<Router>("router"),
  });
}

export async function updateRouterAction(
  scope: MutationScope,
  id: string,
  input: UpdateRouterInput,
): Promise<MutationResult<Router>> {
  const parsedId = parseId(scope, id);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(routerCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "edit this router",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    body: {
      router: {
        name: value.name,
        description: value.description,
        admin_state_up: value.adminStateUp,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: "Router updated.",
    transform: transformResource<Router>("router"),
  });
}

export async function deleteRouterAction(scope: MutationScope, id: string) {
  const parsed = parseId(scope, id);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "delete this router",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(parsed.value)}`,
    method: "DELETE",
    invalidates: [],
    successMessage: "Router deleted.",
  });
}

export async function setRouterGatewayAction(
  scope: MutationScope,
  routerId: string,
  input: SetRouterGatewayInput,
): Promise<MutationResult<Router>> {
  const parsedId = parseId(scope, routerId);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(routerGatewaySchema, input, scope);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "set this router gateway",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    body: {
      router: {
        external_gateway_info: {
          network_id: parsed.value.networkId,
          enable_snat: parsed.value.enableSnat,
        },
      },
    },
    invalidates: networkingInvalidates,
    successMessage: "Router gateway updated.",
    transform: transformResource<Router>("router"),
  });
}

export async function clearRouterGatewayAction(
  scope: MutationScope,
  routerId: string,
) {
  const parsed = parseId(scope, routerId);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "clear this router gateway",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(parsed.value)}`,
    method: "PUT",
    body: { router: { external_gateway_info: null } },
    invalidates: networkingInvalidates,
    successMessage: "Router gateway cleared.",
    transform: transformResource<Router>("router"),
  });
}

function validateRouterRoute(
  scope: MutationScope,
  route: z.output<typeof routerRouteSchema>,
) {
  const destinationVersion = isIP(route.destination.split("/")[0] ?? "");
  const nexthopVersion = isIP(route.nexthop);
  if (destinationVersion !== nexthopVersion) {
    return validationFailure(
      scope,
      "The destination and next hop must use the same IP version.",
    );
  }
  return null;
}

function mutateRouterRoute(
  scope: MutationScope,
  routerId: string,
  route: z.output<typeof routerRouteSchema>,
  operation: "add_extraroutes" | "remove_extraroutes",
  invalidates = networkingInvalidates,
) {
  const adding = operation === "add_extraroutes";
  return executeOpenStackMutation<Router>({
    actionLabel: adding ? "add this static route" : "remove this static route",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(routerId)}/${operation}`,
    method: "PUT",
    body: {
      router: {
        routes: [route],
      },
    },
    invalidates,
    successMessage: adding ? "Static route added." : "Static route removed.",
    transform: transformResource<Router>("router"),
  });
}

export async function addRouterRouteAction(
  scope: MutationScope,
  routerId: string,
  input: RouterRouteInput,
): Promise<MutationResult<Router>> {
  const parsedId = parseId(scope, routerId);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(routerRouteSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const invalid = validateRouterRoute(scope, parsed.value);
  if (invalid) return invalid;
  return mutateRouterRoute(
    scope,
    parsedId.value,
    parsed.value,
    "add_extraroutes",
  );
}

export async function removeRouterRouteAction(
  scope: MutationScope,
  routerId: string,
  input: RouterRouteInput,
): Promise<MutationResult<Router>> {
  const parsedId = parseId(scope, routerId);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(routerRouteSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const invalid = validateRouterRoute(scope, parsed.value);
  if (invalid) return invalid;
  return mutateRouterRoute(
    scope,
    parsedId.value,
    parsed.value,
    "remove_extraroutes",
  );
}

export async function replaceRouterRouteAction(
  scope: MutationScope,
  routerId: string,
  originalInput: RouterRouteInput,
  replacementInput: RouterRouteInput,
): Promise<MutationResult<Router | undefined>> {
  const parsedId = parseId(scope, routerId);
  if (!parsedId.ok) return parsedId.result;
  const original = parse(routerRouteSchema, originalInput, scope);
  if (!original.ok) return original.result;
  const replacement = parse(routerRouteSchema, replacementInput, scope);
  if (!replacement.ok) return replacement.result;
  const invalid = validateRouterRoute(scope, replacement.value);
  if (invalid) return invalid;

  if (
    original.value.destination === replacement.value.destination &&
    original.value.nexthop === replacement.value.nexthop
  ) {
    return {
      ok: true,
      status: "success",
      data: undefined,
      message: "No route changes were needed.",
      scope,
    };
  }

  const added = await mutateRouterRoute(
    scope,
    parsedId.value,
    replacement.value,
    "add_extraroutes",
    [],
  );
  if (!added.ok) return added;

  const removed = await mutateRouterRoute(
    scope,
    parsedId.value,
    original.value,
    "remove_extraroutes",
  );
  if (removed.ok) {
    return { ...removed, message: "Static route updated." };
  }

  const rolledBack = await mutateRouterRoute(
    scope,
    parsedId.value,
    replacement.value,
    "remove_extraroutes",
  );
  return mutationFailure(
    {
      ...removed.error,
      message: rolledBack.ok
        ? "The original route could not be removed, so no changes were saved."
        : "The original route could not be removed and the replacement could not be rolled back. Refresh and review this router now.",
    },
    scope,
  );
}

export async function addRouterInterfaceAction(
  scope: MutationScope,
  routerId: string,
  input: z.input<typeof routerInterfaceSchema>,
) {
  const parsedId = parseId(scope, routerId);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(routerInterfaceSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation<Record<string, unknown>>({
    actionLabel: "connect this subnet to the router",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(parsedId.value)}/add_router_interface`,
    method: "PUT",
    body: { subnet_id: parsed.value.subnetId },
    invalidates: networkingInvalidates,
    successMessage: "Subnet connected to the router.",
  });
}

export async function removeRouterInterfaceAction(
  scope: MutationScope,
  routerId: string,
  input: z.input<typeof routerInterfaceSchema>,
) {
  const parsedId = parseId(scope, routerId);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(routerInterfaceSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation<Record<string, unknown>>({
    actionLabel: "disconnect this subnet from the router",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(parsedId.value)}/remove_router_interface`,
    method: "PUT",
    body: { subnet_id: parsed.value.subnetId },
    invalidates: networkingInvalidates,
    successMessage: "Subnet disconnected from the router.",
  });
}

export async function createPortAction(
  scope: MutationScope,
  input: CreatePortInput,
): Promise<MutationResult<Port>> {
  const parsed = parse(portCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "create a port",
    scope,
    ...NEUTRON_SERVICE,
    path: "/v2.0/ports",
    method: "POST",
    body: {
      port: {
        name: value.name,
        description: value.description,
        network_id: value.networkId,
        admin_state_up: value.adminStateUp,
        port_security_enabled: value.portSecurityEnabled,
        security_groups: value.securityGroupIds,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: `Port ${value.name} created.`,
    transform: transformResource<Port>("port"),
  });
}

export async function updatePortAction(
  scope: MutationScope,
  id: string,
  input: UpdatePortInput,
): Promise<MutationResult<Port>> {
  const parsedId = parseId(scope, id);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(portUpdateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "edit this port",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/ports/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    body: {
      port: {
        name: value.name,
        description: value.description,
        admin_state_up: value.adminStateUp,
        port_security_enabled: value.portSecurityEnabled,
        security_groups: value.securityGroupIds,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: "Port updated.",
    transform: transformResource<Port>("port"),
  });
}

export async function deletePortAction(scope: MutationScope, id: string) {
  const parsed = parseId(scope, id);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "delete this port",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/ports/${encodeURIComponent(parsed.value)}`,
    method: "DELETE",
    invalidates: [],
    successMessage: "Port deleted.",
  });
}

export async function createFloatingIpAction(
  scope: MutationScope,
  input: CreateFloatingIpInput,
): Promise<MutationResult<FloatingIp>> {
  const parsed = parse(floatingIpCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "allocate a floating IP",
    scope,
    ...NEUTRON_SERVICE,
    path: "/v2.0/floatingips",
    method: "POST",
    body: {
      floatingip: {
        floating_network_id: value.floatingNetworkId,
        description: value.description,
        port_id: value.portId,
        fixed_ip_address: value.fixedIpAddress,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: "Floating IP allocated.",
    transform: transformResource<FloatingIp>("floatingip"),
  });
}

export async function updateFloatingIpAction(
  scope: MutationScope,
  id: string,
  input: UpdateFloatingIpInput,
): Promise<MutationResult<FloatingIp>> {
  const parsedId = parseId(scope, id);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(floatingIpUpdateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "update this floating IP",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/floatingips/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    body: {
      floatingip: {
        description: value.description,
        port_id: value.portId ?? null,
        fixed_ip_address: value.fixedIpAddress ?? null,
      },
    },
    invalidates: networkingInvalidates,
    successMessage: "Floating IP updated.",
    transform: transformResource<FloatingIp>("floatingip"),
  });
}

export async function deleteFloatingIpAction(scope: MutationScope, id: string) {
  const parsed = parseId(scope, id);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "release this floating IP",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/floatingips/${encodeURIComponent(parsed.value)}`,
    method: "DELETE",
    invalidates: [],
    successMessage: "Floating IP released.",
  });
}

export async function createSecurityGroupAction(
  scope: MutationScope,
  input: CreateSecurityGroupInput,
): Promise<MutationResult<SecurityGroup>> {
  const parsed = parse(securityGroupCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "create a security group",
    scope,
    ...NEUTRON_SERVICE,
    path: "/v2.0/security-groups",
    method: "POST",
    body: { security_group: parsed.value },
    invalidates: networkingInvalidates,
    successMessage: `Security group ${parsed.value.name} created.`,
    transform: transformResource<SecurityGroup>("security_group"),
  });
}

export async function updateSecurityGroupAction(
  scope: MutationScope,
  id: string,
  input: UpdateSecurityGroupInput,
): Promise<MutationResult<SecurityGroup>> {
  const parsedId = parseId(scope, id);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(securityGroupCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "edit this security group",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/security-groups/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    body: { security_group: parsed.value },
    invalidates: networkingInvalidates,
    successMessage: "Security group updated.",
    transform: transformResource<SecurityGroup>("security_group"),
  });
}

export async function deleteSecurityGroupAction(
  scope: MutationScope,
  id: string,
) {
  const parsed = parseId(scope, id);
  if (!parsed.ok) return parsed.result;
  return executeOpenStackMutation({
    actionLabel: "delete this security group",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/security-groups/${encodeURIComponent(parsed.value)}`,
    method: "DELETE",
    invalidates: [],
    successMessage: "Security group deleted.",
  });
}

export async function createSecurityGroupRuleAction(
  scope: MutationScope,
  input: CreateSecurityGroupRuleInput,
): Promise<MutationResult<SecurityGroupRule>> {
  const parsed = parse(securityGroupRuleCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  const invalid = validateSecurityGroupRule(scope, value);
  if (invalid) return invalid;
  return createSecurityGroupRuleMutation(scope, value, networkingInvalidates);
}

function validateSecurityGroupRule(
  scope: MutationScope,
  value: SecurityGroupRuleValue,
) {
  if (
    value.portRangeMin !== undefined &&
    value.portRangeMax !== undefined &&
    value.portRangeMin > value.portRangeMax
  ) {
    return validationFailure(
      scope,
      "The first port must not be greater than the last port.",
    );
  }
  return null;
}

function createSecurityGroupRuleMutation(
  scope: MutationScope,
  value: SecurityGroupRuleValue,
  invalidates: string[],
) {
  return executeOpenStackMutation({
    actionLabel: "create a security group rule",
    scope,
    ...NEUTRON_SERVICE,
    path: "/v2.0/security-group-rules",
    method: "POST",
    body: {
      security_group_rule: {
        security_group_id: value.securityGroupId,
        description: value.description,
        direction: value.direction,
        ethertype: value.ethertype,
        protocol: value.protocol || null,
        port_range_min: value.portRangeMin,
        port_range_max: value.portRangeMax,
        remote_ip_prefix: value.remoteIpPrefix || null,
        remote_group_id: value.remoteGroupId || null,
      },
    },
    invalidates,
    successMessage: "Security group rule created.",
    transform: transformResource<SecurityGroupRule>("security_group_rule"),
  });
}

function deleteSecurityGroupRuleMutation(
  scope: MutationScope,
  id: string,
  invalidates: string[],
) {
  return executeOpenStackMutation({
    actionLabel: "delete this security group rule",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/security-group-rules/${encodeURIComponent(id)}`,
    method: "DELETE",
    invalidates,
    successMessage: "Security group rule deleted.",
  });
}

function sameRuleMatch(
  original: SecurityGroupRuleValue,
  replacement: SecurityGroupRuleValue,
) {
  const match = (value: SecurityGroupRuleValue) => [
    value.securityGroupId,
    value.direction,
    value.ethertype,
    value.protocol || null,
    value.portRangeMin ?? null,
    value.portRangeMax ?? null,
    value.remoteIpPrefix || null,
    value.remoteGroupId || null,
  ];
  return JSON.stringify(match(original)) === JSON.stringify(match(replacement));
}

export async function replaceSecurityGroupRuleAction(
  scope: MutationScope,
  id: string,
  originalInput: CreateSecurityGroupRuleInput,
  replacementInput: CreateSecurityGroupRuleInput,
): Promise<MutationResult<SecurityGroupRule>> {
  const parsedId = parseId(scope, id);
  if (!parsedId.ok) return parsedId.result;
  const original = parse(securityGroupRuleCreateSchema, originalInput, scope);
  if (!original.ok) return original.result;
  const replacement = parse(
    securityGroupRuleCreateSchema,
    replacementInput,
    scope,
  );
  if (!replacement.ok) return replacement.result;
  const invalid = validateSecurityGroupRule(scope, replacement.value);
  if (invalid) return invalid;
  if (original.value.securityGroupId !== replacement.value.securityGroupId) {
    return validationFailure(
      scope,
      "A rule cannot be moved to another security group.",
    );
  }

  if (sameRuleMatch(original.value, replacement.value)) {
    const removed = await deleteSecurityGroupRuleMutation(
      scope,
      parsedId.value,
      [],
    );
    if (!removed.ok) return removed;

    const created = await createSecurityGroupRuleMutation(
      scope,
      replacement.value,
      networkingInvalidates,
    );
    if (created.ok) {
      return { ...created, message: "Security group rule updated." };
    }

    const restored = await createSecurityGroupRuleMutation(
      scope,
      original.value,
      networkingInvalidates,
    );
    return mutationFailure(
      {
        ...created.error,
        message: restored.ok
          ? "The replacement was rejected, so the original rule was restored."
          : "The replacement and automatic restore both failed. Refresh and review this security group now.",
      },
      scope,
    );
  }

  const created = await createSecurityGroupRuleMutation(
    scope,
    replacement.value,
    [],
  );
  if (!created.ok) return created;

  const removed = await deleteSecurityGroupRuleMutation(
    scope,
    parsedId.value,
    networkingInvalidates,
  );
  if (removed.ok) {
    return { ...created, message: "Security group rule updated." };
  }

  const rolledBack = await deleteSecurityGroupRuleMutation(
    scope,
    created.data.id,
    networkingInvalidates,
  );
  return mutationFailure(
    {
      ...removed.error,
      message: rolledBack.ok
        ? "The original rule could not be removed, so no changes were saved."
        : "The original rule could not be removed and the replacement could not be rolled back. Refresh and review this security group now.",
    },
    scope,
  );
}

export async function deleteSecurityGroupRuleAction(
  scope: MutationScope,
  id: string,
) {
  const parsed = parseId(scope, id);
  if (!parsed.ok) return parsed.result;
  return deleteSecurityGroupRuleMutation(
    scope,
    parsed.value,
    networkingInvalidates,
  );
}

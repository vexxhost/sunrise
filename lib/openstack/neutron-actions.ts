"use server";

import { isIP } from "node:net";
import { z } from "zod";

import {
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { getCidrPrefixLength } from "@/lib/network-address";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
  NEUTRON_ATOMIC_EXTRA_ROUTE_EXTENSION,
  NEUTRON_DNS_DOMAIN_PORTS_EXTENSION,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
  NEUTRON_ENABLE_DEFAULT_ROUTE_BFD_EXTENSION,
  NEUTRON_ENABLE_DEFAULT_ROUTE_ECMP_EXTENSION,
  NEUTRON_EXTERNAL_GATEWAY_MULTIHOMING_EXTENSION,
  NEUTRON_EXTRA_DHCP_OPTIONS_EXTENSION,
  NEUTRON_NETWORK_AVAILABILITY_ZONE_EXTENSION,
  NEUTRON_NETWORK_MTU_WRITABLE_EXTENSION,
  NEUTRON_PORT_BINDING_EXTENSION,
  NEUTRON_PORT_HARDWARE_OFFLOAD_TYPE_EXTENSION,
  NEUTRON_PORT_MAC_ADDRESS_REGENERATE_EXTENSION,
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_EXTENSION,
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_SOCKET_EXTENSION,
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_PORT_TRUSTED_VIF_EXTENSION,
  NEUTRON_QOS_EXTENSION,
  NEUTRON_QOS_FLOATING_IP_EXTENSION,
  NEUTRON_QOS_GATEWAY_IP_EXTENSION,
  NEUTRON_ROUTER_AVAILABILITY_ZONE_EXTENSION,
  NEUTRON_SECURITY_GROUP_EXTENSION,
  NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
  NEUTRON_SUBNET_DNS_PUBLISH_FIXED_IP_EXTENSION,
  NEUTRON_UPLINK_STATUS_PROPAGATION_EXTENSION,
  NEUTRON_UPLINK_STATUS_PROPAGATION_UPDATABLE_EXTENSION,
  NEUTRON_VLAN_TRANSPARENCY_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import {
  NEUTRON_PORT_HARDWARE_OFFLOAD_TYPES,
  NEUTRON_PORT_NUMA_AFFINITY_POLICIES,
} from "@/lib/openstack/neutron-port-placement";
import { NEUTRON_PORT_VNIC_TYPES } from "@/lib/openstack/neutron-port-vnic-types";
import {
  getIpv6ConfigurationAttributes,
  usesIpv6AutoAddressing,
} from "@/lib/openstack/neutron-ipv6";
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
const optionalName = z.string().trim().max(255);
const description = z.string().trim().max(1024).default("");
function isValidDnsLabels(value: string) {
  const labels = value.split(".");
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}
function isValidDnsName(value: string) {
  if (!value) return true;
  const labels = value.endsWith(".") ? value.slice(0, -1) : value;
  return Boolean(labels) && isValidDnsLabels(labels);
}
const dnsName = z
  .string()
  .trim()
  .max(255)
  .refine(
    isValidDnsName,
    "Enter a valid DNS name using letters, numbers, dots, and hyphens.",
  )
  .optional();
const dnsDomain = z
  .string()
  .trim()
  .max(255)
  .refine(
    (value) => value === "" || (value.endsWith(".") && isValidDnsName(value)),
    "Enter a fully qualified DNS domain ending with a dot, such as example.org.",
  )
  .optional();
const relativeDnsName = z
  .string()
  .trim()
  .max(255)
  .refine(
    (value) => value === "" || (!value.endsWith(".") && isValidDnsName(value)),
    "Enter a relative DNS name without a trailing dot.",
  )
  .optional();
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
const ipAddressOrCidr = z
  .string()
  .trim()
  .max(64)
  .refine(
    (value) => isIP(value) !== 0 || isCidr(value),
    "Enter a valid IP address or CIDR.",
  );
const optionalMacAddress = z
  .string()
  .trim()
  .max(17)
  .refine(
    (value) => value === "" || /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value),
    "Enter a valid MAC address, such as fa:16:3e:00:00:01.",
  )
  .transform((value) => value.toLowerCase());
const allowedAddressPairs = z
  .array(
    z.object({
      ipAddress: ipAddressOrCidr,
      macAddress: optionalMacAddress.default(""),
    }),
  )
  .superRefine((pairs, context) => {
    const seen = new Set<string>();
    for (const [index, pair] of pairs.entries()) {
      const key = `${pair.ipAddress.toLowerCase()}|${pair.macAddress}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Remove the duplicate allowed address pair.",
          path: [index],
        });
      }
      seen.add(key);
    }
  })
  .optional();
const blankExtraDhcpOptionNames = new Set(["router", "classless-static-route"]);
const extraDhcpOptionName = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => !/[\r\n]/.test(value), "Use a single-line option name.");
const extraDhcpOptionValue = z
  .string()
  .trim()
  .max(255)
  .refine((value) => !/[\r\n]/.test(value), "Use a single-line option value.");
const extraDhcpOption = z
  .object({
    ipVersion: z.union([z.literal(4), z.literal(6)]),
    optName: extraDhcpOptionName,
    optValue: extraDhcpOptionValue,
  })
  .superRefine((option, context) => {
    if (!option.optValue && !blankExtraDhcpOptionNames.has(option.optName)) {
      context.addIssue({
        code: "custom",
        message: "Enter an option value.",
        path: ["optValue"],
      });
    }
  });
const extraDhcpOptionPatch = z
  .object({
    ipVersion: z.union([z.literal(4), z.literal(6)]),
    optName: extraDhcpOptionName,
    optValue: extraDhcpOptionValue.nullable(),
  })
  .superRefine((option, context) => {
    if (
      option.optValue === "" &&
      !blankExtraDhcpOptionNames.has(option.optName)
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter an option value.",
        path: ["optValue"],
      });
    }
  });
function extraDhcpOptionsSchema<Option extends z.ZodTypeAny>(option: Option) {
  return z
    .array(option)
    .superRefine((options, context) => {
      const seen = new Set<string>();
      for (const [index, value] of options.entries()) {
        const parsed = value as {
          ipVersion: 4 | 6;
          optName: string;
        };
        const key = `${parsed.ipVersion}:${parsed.optName}`;
        if (seen.has(key)) {
          context.addIssue({
            code: "custom",
            message: "Remove the duplicate DHCP option for this IP version.",
            path: [index],
          });
        }
        seen.add(key);
      }
    })
    .optional();
}
const extraDhcpOptions = extraDhcpOptionsSchema(extraDhcpOption);
const extraDhcpOptionPatches = extraDhcpOptionsSchema(extraDhcpOptionPatch);
const allocationPools = z
  .array(z.object({ start: ipAddress, end: ipAddress }))
  .max(32)
  .optional();
const dnsNameservers = z.array(ipAddress).max(16).optional();
const routeSchema = z.object({
  destination: cidr,
  nexthop: ipAddress,
});
const hostRoutes = z.array(routeSchema).max(32).default([]);
const ipv6ConfigurationMode = z
  .enum([
    "none",
    "slaac-openstack",
    "slaac-external",
    "dhcpv6-stateful",
    "dhcpv6-stateless",
  ])
  .default("none");
const networkMtu = z.number().int().min(0).optional();

type SubnetAddressingValue = {
  allocationPools?: Array<{ start: string; end: string }>;
  disableGateway: boolean;
  dnsNameservers?: string[];
  gatewayIp?: string;
  hostRoutes: Array<{ destination: string; nexthop: string }>;
  ipVersion: 4 | 6;
};

type IPv6ConfigurationValue = {
  cidr: string;
  enableDhcp: boolean;
  ipVersion: 4 | 6;
  ipv6Mode:
    | "none"
    | "slaac-openstack"
    | "slaac-external"
    | "dhcpv6-stateful"
    | "dhcpv6-stateless";
};

function validateSubnetAddressing(
  value: SubnetAddressingValue,
  context: z.RefinementCtx,
) {
  const validateAddress = (address: string, path: PropertyKey[]) => {
    if (isIP(address) !== value.ipVersion) {
      context.addIssue({
        code: "custom",
        message: `Use an IPv${value.ipVersion} address.`,
        path,
      });
    }
  };

  if (!value.disableGateway && value.gatewayIp) {
    validateAddress(value.gatewayIp, ["gatewayIp"]);
  }
  value.allocationPools?.forEach((pool, index) => {
    validateAddress(pool.start, ["allocationPools", index, "start"]);
    validateAddress(pool.end, ["allocationPools", index, "end"]);
  });
  value.dnsNameservers?.forEach((server, index) => {
    validateAddress(server, ["dnsNameservers", index]);
  });
  value.hostRoutes.forEach((route, index) => {
    const destination = route.destination.split("/")[0] ?? "";
    validateAddress(destination, ["hostRoutes", index, "destination"]);
    validateAddress(route.nexthop, ["hostRoutes", index, "nexthop"]);
  });
}

function validateIpv6Configuration(
  value: IPv6ConfigurationValue,
  context: z.RefinementCtx,
) {
  if (value.ipVersion === 4 && value.ipv6Mode !== "none") {
    context.addIssue({
      code: "custom",
      message: "IPv6 address configuration is only available for IPv6 subnets.",
      path: ["ipv6Mode"],
    });
  }
  if (value.ipv6Mode !== "none" && !value.enableDhcp) {
    context.addIssue({
      code: "custom",
      message: "Enable DHCP to use IPv6 address configuration.",
      path: ["enableDhcp"],
    });
  }
  if (
    value.ipVersion === 6 &&
    usesIpv6AutoAddressing(value.ipv6Mode) &&
    getCidrPrefixLength(value.cidr) !== 64
  ) {
    context.addIssue({
      code: "custom",
      message:
        "A /64 prefix is required for SLAAC and DHCPv6 stateless addressing.",
      path: ["cidr"],
    });
  }
}

const networkCreateSchema = z.object({
  name,
  description,
  dnsDomain,
  adminStateUp: z.boolean().default(true),
  availabilityZoneHints: z
    .array(resourceId)
    .transform((values) => [...new Set(values)])
    .optional(),
  portSecurityEnabled: z.boolean().optional(),
  qosPolicyId: resourceId.optional(),
  mtu: networkMtu,
  vlanTransparent: z.boolean().optional(),
});
const networkUpdateSchema = z.object({
  name,
  description,
  dnsDomain,
  adminStateUp: z.boolean().default(true),
  portSecurityEnabled: z.boolean().optional(),
  qosPolicyId: resourceId.nullable().optional(),
  mtu: networkMtu,
});
const subnetCreateSchema = z
  .object({
    networkId: resourceId,
    name,
    description,
    cidr,
    ipVersion: z.union([z.literal(4), z.literal(6)]),
    gatewayIp: optionalIpAddress,
    disableGateway: z.boolean().default(false),
    enableDhcp: z.boolean().default(true),
    dnsPublishFixedIp: z.boolean().optional(),
    ipv6Mode: ipv6ConfigurationMode,
    allocationPools,
    dnsNameservers,
    hostRoutes,
  })
  .superRefine((value, context) => {
    if (isIP(value.cidr.split("/")[0] ?? "") !== value.ipVersion) {
      context.addIssue({
        code: "custom",
        message: `The CIDR must use IPv${value.ipVersion}.`,
        path: ["cidr"],
      });
    }
    validateSubnetAddressing(value, context);
    validateIpv6Configuration(value, context);
  });
const subnetUpdateSchema = z
  .object({
    name,
    description,
    cidr,
    ipVersion: z.union([z.literal(4), z.literal(6)]),
    gatewayIp: optionalIpAddress,
    disableGateway: z.boolean().default(false),
    enableDhcp: z.boolean(),
    dnsPublishFixedIp: z.boolean().optional(),
    currentIpv6Mode: ipv6ConfigurationMode,
    allocationPools,
    dnsNameservers,
    hostRoutes,
  })
  .superRefine((value, context) => {
    if (!value.disableGateway && !value.gatewayIp) {
      context.addIssue({
        code: "custom",
        message: "Enter a gateway address or disable the gateway.",
        path: ["gatewayIp"],
      });
    }
    if (value.currentIpv6Mode !== "none" && !value.enableDhcp) {
      context.addIssue({
        code: "custom",
        message:
          "DHCP cannot be disabled while IPv6 address configuration is active.",
        path: ["enableDhcp"],
      });
    }
    validateSubnetAddressing(value, context);
  });
const routerCreateSchema = z.object({
  name,
  description,
  adminStateUp: z.boolean().default(true),
  enableDefaultRouteBfd: z.boolean().optional(),
  enableDefaultRouteEcmp: z.boolean().optional(),
  availabilityZoneHints: z
    .array(resourceId)
    .transform((values) => [...new Set(values)])
    .optional(),
});
const routerUpdateSchema = z.object({
  name,
  description,
  adminStateUp: z.boolean().default(true),
  enableDefaultRouteBfd: z.boolean().optional(),
  enableDefaultRouteEcmp: z.boolean().optional(),
});
const routerRouteSchema = routeSchema;
const routerGatewaySchema = z.object({
  networkId: resourceId,
  enableSnat: z.boolean().default(true),
  qosPolicyId: resourceId.nullable().optional(),
});
const routerExternalGatewaySchema = z.object({
  networkId: resourceId,
});
const routerExternalGatewayRemovalSchema = z.object({
  networkId: resourceId,
  externalFixedIps: z
    .array(
      z.object({
        subnetId: resourceId,
        ipAddress,
      }),
    )
    .min(1),
});
const routerInterfaceSchema = z.object({ subnetId: resourceId });
const portSecurityFields = {
  allowedAddressPairs,
  portSecurityEnabled: z.boolean().optional(),
  securityGroupIds: z.array(resourceId).optional(),
};
function requirePortSecurityForAddressPairs(
  value: {
    allowedAddressPairs?: unknown[];
    portSecurityEnabled?: boolean;
  },
  context: z.RefinementCtx,
) {
  if (
    value.portSecurityEnabled === false &&
    value.allowedAddressPairs?.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Enable port security before adding allowed address pairs.",
      path: ["allowedAddressPairs"],
    });
  }
}
const portCreateSchema = z
  .object({
    name,
    description,
    dnsDomain,
    dnsName,
    networkId: resourceId,
    adminStateUp: z.boolean().default(true),
    vnicType: z.enum(NEUTRON_PORT_VNIC_TYPES).optional(),
    hardwareOffloadType: z.enum(NEUTRON_PORT_HARDWARE_OFFLOAD_TYPES).optional(),
    numaAffinityPolicy: z.enum(NEUTRON_PORT_NUMA_AFFINITY_POLICIES).optional(),
    trusted: z.boolean().optional(),
    propagateUplinkStatus: z.boolean().optional(),
    extraDhcpOptions,
    qosPolicyId: resourceId.nullable().optional(),
    ...portSecurityFields,
  })
  .superRefine((value, context) => {
    requirePortSecurityForAddressPairs(value, context);
    if (
      value.hardwareOffloadType === "switchdev" &&
      value.vnicType !== "direct"
    ) {
      context.addIssue({
        code: "custom",
        message: "Switchdev hardware offload requires a direct vNIC type.",
        path: ["hardwareOffloadType"],
      });
    }
    if (value.trusted === true && value.vnicType !== "direct") {
      context.addIssue({
        code: "custom",
        message: "Trusted VIF mode requires a direct vNIC type.",
        path: ["trusted"],
      });
    }
  });
const portUpdateSchema = z
  .object({
    name: optionalName,
    description,
    dnsDomain,
    dnsName,
    adminStateUp: z.boolean(),
    vnicType: z.enum(NEUTRON_PORT_VNIC_TYPES).optional(),
    numaAffinityPolicy: z
      .enum(NEUTRON_PORT_NUMA_AFFINITY_POLICIES)
      .nullable()
      .optional(),
    trusted: z.boolean().optional(),
    propagateUplinkStatus: z.boolean().optional(),
    extraDhcpOptions: extraDhcpOptionPatches,
    qosPolicyId: resourceId.nullable().optional(),
    ...portSecurityFields,
  })
  .superRefine(requirePortSecurityForAddressPairs);
const floatingIpCreateSchema = z
  .object({
    floatingNetworkId: resourceId,
    description,
    portId: resourceId.optional(),
    fixedIpAddress: optionalIpAddress,
    dnsName: relativeDnsName,
    dnsDomain,
    qosPolicyId: resourceId.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.dnsName) === Boolean(value.dnsDomain)) return;
    context.addIssue({
      code: "custom",
      message: "Enter both a DNS name and DNS domain, or leave both empty.",
      path: [value.dnsName ? "dnsDomain" : "dnsName"],
    });
  });
const floatingIpUpdateSchema = z.object({
  description,
  portId: resourceId.optional().nullable(),
  fixedIpAddress: optionalIpAddress.nullable(),
  qosPolicyId: resourceId.nullable().optional(),
});
const securityGroupCreateSchema = z.object({
  name,
  description,
  stateful: z.boolean().optional(),
});
const securityGroupUpdateSchema = z.object({
  name: name.optional(),
  description,
  stateful: z.boolean().optional(),
});
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
export type UpdateRouterInput = z.input<typeof routerUpdateSchema>;
export type SetRouterGatewayInput = z.input<typeof routerGatewaySchema>;
export type AddRouterExternalGatewayInput = z.input<
  typeof routerExternalGatewaySchema
>;
export type RemoveRouterExternalGatewayInput = z.input<
  typeof routerExternalGatewayRemovalSchema
>;
export type RouterRouteInput = z.input<typeof routerRouteSchema>;
export type CreatePortInput = z.input<typeof portCreateSchema>;
export type UpdatePortInput = z.input<typeof portUpdateSchema>;
export type CreateFloatingIpInput = z.input<typeof floatingIpCreateSchema>;
export type UpdateFloatingIpInput = z.input<typeof floatingIpUpdateSchema>;
export type CreateSecurityGroupInput = z.input<
  typeof securityGroupCreateSchema
>;
export type UpdateSecurityGroupInput = z.input<
  typeof securityGroupUpdateSchema
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

const networkingInvalidates = ["/networking", "/networking/topology"];

async function unsupportedNetworkExtensionsFailure(
  scope: MutationScope,
  requirements: Array<{ feature: string; required: string }>,
) {
  if (!scope.regionId || requirements.length === 0) return null;
  const capabilities = await discoverNetworkCapabilities(scope.regionId);
  const unsupported = requirements
    .map(({ feature, required }) =>
      extensionSupport(capabilities, required, feature),
    )
    .find((support) => support.status === "unsupported");
  if (!unsupported) return null;

  return mutationFailure(
    {
      code: "service-unavailable",
      message: unsupported.message,
      retryable: false,
    },
    scope,
  );
}

export async function createNetworkAction(
  scope: MutationScope,
  input: CreateNetworkInput,
): Promise<MutationResult<Network>> {
  const parsed = parse(networkCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.dnsDomain === undefined
      ? []
      : [
          {
            feature: "Network DNS domains",
            required: NEUTRON_DNS_INTEGRATION_EXTENSION,
          },
        ]),
    ...(value.portSecurityEnabled === undefined
      ? []
      : [
          {
            feature: "Port security",
            required: NEUTRON_PORT_SECURITY_EXTENSION,
          },
        ]),
    ...(value.qosPolicyId === undefined
      ? []
      : [
          {
            feature: "Network QoS policies",
            required: NEUTRON_QOS_EXTENSION,
          },
        ]),
    ...(value.availabilityZoneHints?.length
      ? [
          {
            feature: "Network availability-zone scheduling",
            required: NEUTRON_NETWORK_AVAILABILITY_ZONE_EXTENSION,
          },
        ]
      : []),
    ...(value.mtu === undefined
      ? []
      : [
          {
            feature: "Network MTU configuration",
            required: NEUTRON_NETWORK_MTU_WRITABLE_EXTENSION,
          },
        ]),
    ...(value.vlanTransparent
      ? [
          {
            feature: "VLAN transparency",
            required: NEUTRON_VLAN_TRANSPARENCY_EXTENSION,
          },
        ]
      : []),
  ]);
  if (unsupported) return unsupported;
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
        ...(value.dnsDomain === undefined
          ? {}
          : { dns_domain: value.dnsDomain }),
        admin_state_up: value.adminStateUp,
        ...(value.availabilityZoneHints?.length
          ? { availability_zone_hints: value.availabilityZoneHints }
          : {}),
        ...(value.portSecurityEnabled === undefined
          ? {}
          : { port_security_enabled: value.portSecurityEnabled }),
        ...(value.qosPolicyId === undefined
          ? {}
          : { qos_policy_id: value.qosPolicyId }),
        ...(value.mtu === undefined ? {} : { mtu: value.mtu }),
        ...(value.vlanTransparent ? { vlan_transparent: true } : {}),
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
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.dnsDomain === undefined
      ? []
      : [
          {
            feature: "Network DNS domains",
            required: NEUTRON_DNS_INTEGRATION_EXTENSION,
          },
        ]),
    ...(value.portSecurityEnabled === undefined
      ? []
      : [
          {
            feature: "Port security",
            required: NEUTRON_PORT_SECURITY_EXTENSION,
          },
        ]),
    ...(value.qosPolicyId === undefined
      ? []
      : [
          {
            feature: "Network QoS policies",
            required: NEUTRON_QOS_EXTENSION,
          },
        ]),
    ...(value.mtu === undefined
      ? []
      : [
          {
            feature: "Network MTU configuration",
            required: NEUTRON_NETWORK_MTU_WRITABLE_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
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
        ...(value.dnsDomain === undefined
          ? {}
          : { dns_domain: value.dnsDomain }),
        admin_state_up: value.adminStateUp,
        ...(value.portSecurityEnabled === undefined
          ? {}
          : { port_security_enabled: value.portSecurityEnabled }),
        ...(value.qosPolicyId === undefined
          ? {}
          : { qos_policy_id: value.qosPolicyId }),
        ...(value.mtu === undefined ? {} : { mtu: value.mtu }),
      },
    },
    invalidates: [
      ...networkingInvalidates,
      `/networking/networks/${parsedId.value}`,
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
  const ipv6Configuration = getIpv6ConfigurationAttributes(value.ipv6Mode);
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.dnsPublishFixedIp === undefined
      ? []
      : [
          {
            feature: "Subnet fixed-IP DNS publication",
            required: NEUTRON_SUBNET_DNS_PUBLISH_FIXED_IP_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
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
        ...(value.disableGateway
          ? { gateway_ip: null }
          : value.gatewayIp
            ? { gateway_ip: value.gatewayIp }
            : {}),
        enable_dhcp: value.enableDhcp,
        ...(value.dnsPublishFixedIp === undefined
          ? {}
          : { dns_publish_fixed_ip: value.dnsPublishFixedIp }),
        ...(value.ipVersion === 6 && value.ipv6Mode !== "none"
          ? ipv6Configuration
          : {}),
        allocation_pools: value.allocationPools,
        dns_nameservers: value.dnsNameservers,
        host_routes: value.hostRoutes,
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
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.dnsPublishFixedIp === undefined
      ? []
      : [
          {
            feature: "Subnet fixed-IP DNS publication",
            required: NEUTRON_SUBNET_DNS_PUBLISH_FIXED_IP_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
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
        gateway_ip: value.disableGateway ? null : value.gatewayIp,
        enable_dhcp: value.enableDhcp,
        ...(value.dnsPublishFixedIp === undefined
          ? {}
          : { dns_publish_fixed_ip: value.dnsPublishFixedIp }),
        allocation_pools: value.allocationPools,
        dns_nameservers: value.dnsNameservers,
        host_routes: value.hostRoutes,
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
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.availabilityZoneHints?.length
      ? [
          {
            feature: "Router availability-zone scheduling",
            required: NEUTRON_ROUTER_AVAILABILITY_ZONE_EXTENSION,
          },
        ]
      : []),
    ...(value.enableDefaultRouteBfd === undefined
      ? []
      : [
          {
            feature: "Router default-route BFD",
            required: NEUTRON_ENABLE_DEFAULT_ROUTE_BFD_EXTENSION,
          },
        ]),
    ...(value.enableDefaultRouteEcmp === undefined
      ? []
      : [
          {
            feature: "Router default-route ECMP",
            required: NEUTRON_ENABLE_DEFAULT_ROUTE_ECMP_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
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
        ...(value.enableDefaultRouteBfd === undefined
          ? {}
          : { enable_default_route_bfd: value.enableDefaultRouteBfd }),
        ...(value.enableDefaultRouteEcmp === undefined
          ? {}
          : { enable_default_route_ecmp: value.enableDefaultRouteEcmp }),
        ...(value.availabilityZoneHints?.length
          ? { availability_zone_hints: value.availabilityZoneHints }
          : {}),
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
  const parsed = parse(routerUpdateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.enableDefaultRouteBfd === undefined
      ? []
      : [
          {
            feature: "Router default-route BFD",
            required: NEUTRON_ENABLE_DEFAULT_ROUTE_BFD_EXTENSION,
          },
        ]),
    ...(value.enableDefaultRouteEcmp === undefined
      ? []
      : [
          {
            feature: "Router default-route ECMP",
            required: NEUTRON_ENABLE_DEFAULT_ROUTE_ECMP_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
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
        ...(value.enableDefaultRouteBfd === undefined
          ? {}
          : { enable_default_route_bfd: value.enableDefaultRouteBfd }),
        ...(value.enableDefaultRouteEcmp === undefined
          ? {}
          : { enable_default_route_ecmp: value.enableDefaultRouteEcmp }),
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
  if (parsed.value.qosPolicyId !== undefined) {
    const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
      {
        feature: "Router gateway QoS policies",
        required: NEUTRON_QOS_GATEWAY_IP_EXTENSION,
      },
    ]);
    if (unsupported) return unsupported;
  }
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
          ...(parsed.value.qosPolicyId === undefined
            ? {}
            : { qos_policy_id: parsed.value.qosPolicyId }),
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

export async function addRouterExternalGatewayAction(
  scope: MutationScope,
  routerId: string,
  input: AddRouterExternalGatewayInput,
): Promise<MutationResult<Router>> {
  const parsedId = parseId(scope, routerId);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(routerExternalGatewaySchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    {
      feature: "Multiple router external gateways",
      required: NEUTRON_EXTERNAL_GATEWAY_MULTIHOMING_EXTENSION,
    },
  ]);
  if (unsupported) return unsupported;
  return executeOpenStackMutation({
    actionLabel: "add an external gateway to this router",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(parsedId.value)}/add_external_gateways`,
    method: "PUT",
    body: {
      router: {
        external_gateways: [{ network_id: parsed.value.networkId }],
      },
    },
    invalidates: networkingInvalidates,
    successMessage: "Router gateway added.",
    transform: transformResource<Router>("router"),
  });
}

export async function removeRouterExternalGatewayAction(
  scope: MutationScope,
  routerId: string,
  input: RemoveRouterExternalGatewayInput,
): Promise<MutationResult<Router>> {
  const parsedId = parseId(scope, routerId);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parse(routerExternalGatewayRemovalSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    {
      feature: "Multiple router external gateways",
      required: NEUTRON_EXTERNAL_GATEWAY_MULTIHOMING_EXTENSION,
    },
  ]);
  if (unsupported) return unsupported;
  return executeOpenStackMutation({
    actionLabel: "remove this router external gateway",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/routers/${encodeURIComponent(parsedId.value)}/remove_external_gateways`,
    method: "PUT",
    body: {
      router: {
        external_gateways: [
          {
            network_id: parsed.value.networkId,
            external_fixed_ips: parsed.value.externalFixedIps.map(
              ({ subnetId, ipAddress: address }) => ({
                subnet_id: subnetId,
                ip_address: address,
              }),
            ),
          },
        ],
      },
    },
    invalidates: networkingInvalidates,
    successMessage: "Router gateway removed.",
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

async function unsupportedRouterRouteFailure(scope: MutationScope) {
  if (!scope.regionId) return null;
  const capabilities = await discoverNetworkCapabilities(scope.regionId);
  const support = extensionSupport(
    capabilities,
    NEUTRON_ATOMIC_EXTRA_ROUTE_EXTENSION,
    "Static router route changes",
  );
  if (support.status !== "unsupported") return null;

  return mutationFailure(
    {
      code: "service-unavailable",
      message: support.message,
      retryable: false,
    },
    scope,
  );
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
  const unsupported = await unsupportedRouterRouteFailure(scope);
  if (unsupported) return unsupported;
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
  const unsupported = await unsupportedRouterRouteFailure(scope);
  if (unsupported) return unsupported;
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
  const unsupported = await unsupportedRouterRouteFailure(scope);
  if (unsupported) return unsupported;

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
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.dnsName === undefined
      ? []
      : [
          {
            feature: "Port DNS names",
            required: NEUTRON_DNS_INTEGRATION_EXTENSION,
          },
        ]),
    ...(value.dnsDomain === undefined
      ? []
      : [
          {
            feature: "Per-port DNS domains",
            required: NEUTRON_DNS_DOMAIN_PORTS_EXTENSION,
          },
          {
            feature: "Port DNS names",
            required: NEUTRON_DNS_INTEGRATION_EXTENSION,
          },
        ]),
    ...(value.portSecurityEnabled === undefined
      ? []
      : [
          {
            feature: "Port security",
            required: NEUTRON_PORT_SECURITY_EXTENSION,
          },
        ]),
    ...(value.extraDhcpOptions === undefined
      ? []
      : [
          {
            feature: "Extra DHCP options",
            required: NEUTRON_EXTRA_DHCP_OPTIONS_EXTENSION,
          },
        ]),
    ...(value.securityGroupIds === undefined
      ? []
      : [
          {
            feature: "Security group assignment",
            required: NEUTRON_SECURITY_GROUP_EXTENSION,
          },
        ]),
    ...(value.allowedAddressPairs === undefined
      ? []
      : [
          {
            feature: "Allowed address pairs",
            required: NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
          },
        ]),
    ...(value.qosPolicyId === undefined
      ? []
      : [
          {
            feature: "Port QoS policies",
            required: NEUTRON_QOS_EXTENSION,
          },
        ]),
    ...(value.propagateUplinkStatus === undefined
      ? []
      : [
          {
            feature: "Port uplink-status propagation",
            required: NEUTRON_UPLINK_STATUS_PROPAGATION_EXTENSION,
          },
        ]),
    ...(value.vnicType === undefined
      ? []
      : [
          {
            feature: "Port vNIC types",
            required: NEUTRON_PORT_BINDING_EXTENSION,
          },
        ]),
    ...(value.hardwareOffloadType === undefined
      ? []
      : [
          {
            feature: "Port hardware offload",
            required: NEUTRON_PORT_HARDWARE_OFFLOAD_TYPE_EXTENSION,
          },
        ]),
    ...(value.numaAffinityPolicy === undefined
      ? []
      : [
          {
            feature: "Port NUMA affinity",
            required: NEUTRON_PORT_NUMA_AFFINITY_POLICY_EXTENSION,
          },
          ...(value.numaAffinityPolicy === "socket"
            ? [
                {
                  feature: "Socket-level port NUMA affinity",
                  required: NEUTRON_PORT_NUMA_AFFINITY_POLICY_SOCKET_EXTENSION,
                },
              ]
            : []),
        ]),
    ...(value.trusted === undefined
      ? []
      : [
          {
            feature: "Trusted virtual interfaces",
            required: NEUTRON_PORT_TRUSTED_VIF_EXTENSION,
          },
          {
            feature: "Trusted virtual interfaces",
            required: NEUTRON_PORT_BINDING_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
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
        ...(value.dnsName === undefined ? {} : { dns_name: value.dnsName }),
        ...(value.dnsDomain === undefined
          ? {}
          : { dns_domain: value.dnsDomain }),
        network_id: value.networkId,
        admin_state_up: value.adminStateUp,
        ...(value.vnicType === undefined
          ? {}
          : { "binding:vnic_type": value.vnicType }),
        ...(value.hardwareOffloadType === undefined
          ? {}
          : { hardware_offload_type: value.hardwareOffloadType }),
        ...(value.numaAffinityPolicy === undefined
          ? {}
          : { numa_affinity_policy: value.numaAffinityPolicy }),
        ...(value.trusted === undefined ? {} : { trusted: value.trusted }),
        ...(value.propagateUplinkStatus === undefined
          ? {}
          : { propagate_uplink_status: value.propagateUplinkStatus }),
        ...(value.extraDhcpOptions === undefined
          ? {}
          : {
              extra_dhcp_opts: value.extraDhcpOptions.map((option) => ({
                ip_version: option.ipVersion,
                opt_name: option.optName,
                opt_value: option.optValue,
              })),
            }),
        ...(value.qosPolicyId === undefined
          ? {}
          : { qos_policy_id: value.qosPolicyId }),
        ...(value.portSecurityEnabled === undefined
          ? {}
          : { port_security_enabled: value.portSecurityEnabled }),
        ...(value.securityGroupIds === undefined
          ? {}
          : {
              security_groups:
                value.portSecurityEnabled === false
                  ? []
                  : value.securityGroupIds,
            }),
        ...(value.allowedAddressPairs === undefined
          ? {}
          : {
              allowed_address_pairs: value.allowedAddressPairs.map((pair) => ({
                ip_address: pair.ipAddress,
                ...(pair.macAddress ? { mac_address: pair.macAddress } : {}),
              })),
            }),
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
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.dnsName === undefined
      ? []
      : [
          {
            feature: "Port DNS names",
            required: NEUTRON_DNS_INTEGRATION_EXTENSION,
          },
        ]),
    ...(value.dnsDomain === undefined
      ? []
      : [
          {
            feature: "Per-port DNS domains",
            required: NEUTRON_DNS_DOMAIN_PORTS_EXTENSION,
          },
          {
            feature: "Port DNS names",
            required: NEUTRON_DNS_INTEGRATION_EXTENSION,
          },
        ]),
    ...(value.portSecurityEnabled === undefined
      ? []
      : [
          {
            feature: "Port security",
            required: NEUTRON_PORT_SECURITY_EXTENSION,
          },
        ]),
    ...(value.extraDhcpOptions === undefined
      ? []
      : [
          {
            feature: "Extra DHCP options",
            required: NEUTRON_EXTRA_DHCP_OPTIONS_EXTENSION,
          },
        ]),
    ...(value.securityGroupIds === undefined
      ? []
      : [
          {
            feature: "Security group assignment",
            required: NEUTRON_SECURITY_GROUP_EXTENSION,
          },
        ]),
    ...(value.allowedAddressPairs === undefined
      ? []
      : [
          {
            feature: "Allowed address pairs",
            required: NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
          },
        ]),
    ...(value.qosPolicyId === undefined
      ? []
      : [
          {
            feature: "Port QoS policies",
            required: NEUTRON_QOS_EXTENSION,
          },
        ]),
    ...(value.propagateUplinkStatus === undefined
      ? []
      : [
          {
            feature: "Port uplink-status propagation",
            required: NEUTRON_UPLINK_STATUS_PROPAGATION_EXTENSION,
          },
          {
            feature: "Updating port uplink-status propagation",
            required: NEUTRON_UPLINK_STATUS_PROPAGATION_UPDATABLE_EXTENSION,
          },
        ]),
    ...(value.vnicType === undefined
      ? []
      : [
          {
            feature: "Port vNIC types",
            required: NEUTRON_PORT_BINDING_EXTENSION,
          },
        ]),
    ...(value.numaAffinityPolicy === undefined
      ? []
      : [
          {
            feature: "Port NUMA affinity",
            required: NEUTRON_PORT_NUMA_AFFINITY_POLICY_EXTENSION,
          },
          ...(value.numaAffinityPolicy === "socket"
            ? [
                {
                  feature: "Socket-level port NUMA affinity",
                  required: NEUTRON_PORT_NUMA_AFFINITY_POLICY_SOCKET_EXTENSION,
                },
              ]
            : []),
        ]),
    ...(value.trusted === undefined
      ? []
      : [
          {
            feature: "Trusted virtual interfaces",
            required: NEUTRON_PORT_TRUSTED_VIF_EXTENSION,
          },
          {
            feature: "Trusted virtual interfaces",
            required: NEUTRON_PORT_BINDING_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
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
        ...(value.dnsName === undefined ? {} : { dns_name: value.dnsName }),
        ...(value.dnsDomain === undefined
          ? {}
          : { dns_domain: value.dnsDomain }),
        admin_state_up: value.adminStateUp,
        ...(value.vnicType === undefined
          ? {}
          : { "binding:vnic_type": value.vnicType }),
        ...(value.numaAffinityPolicy === undefined
          ? {}
          : { numa_affinity_policy: value.numaAffinityPolicy }),
        ...(value.trusted === undefined ? {} : { trusted: value.trusted }),
        ...(value.propagateUplinkStatus === undefined
          ? {}
          : { propagate_uplink_status: value.propagateUplinkStatus }),
        ...(value.extraDhcpOptions === undefined
          ? {}
          : {
              extra_dhcp_opts: value.extraDhcpOptions.map((option) => ({
                ip_version: option.ipVersion,
                opt_name: option.optName,
                opt_value: option.optValue,
              })),
            }),
        ...(value.qosPolicyId === undefined
          ? {}
          : { qos_policy_id: value.qosPolicyId }),
        ...(value.portSecurityEnabled === undefined
          ? {}
          : { port_security_enabled: value.portSecurityEnabled }),
        ...(value.securityGroupIds === undefined
          ? {}
          : {
              security_groups:
                value.portSecurityEnabled === false
                  ? []
                  : value.securityGroupIds,
            }),
        ...(value.allowedAddressPairs === undefined
          ? {}
          : {
              allowed_address_pairs: value.allowedAddressPairs.map((pair) => ({
                ip_address: pair.ipAddress,
                ...(pair.macAddress ? { mac_address: pair.macAddress } : {}),
              })),
            }),
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

export async function regeneratePortMacAddressAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<Port>> {
  const parsed = parseId(scope, id);
  if (!parsed.ok) return parsed.result;
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    {
      feature: "Port MAC address regeneration",
      required: NEUTRON_PORT_MAC_ADDRESS_REGENERATE_EXTENSION,
    },
  ]);
  if (unsupported) return unsupported;

  return executeOpenStackMutation({
    actionLabel: "regenerate this port's MAC address",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/ports/${encodeURIComponent(parsed.value)}`,
    method: "PUT",
    body: { port: { mac_address: null } },
    invalidates: networkingInvalidates,
    successMessage: "Port MAC address regenerated.",
    transform: transformResource<Port>("port"),
  });
}

export async function createFloatingIpAction(
  scope: MutationScope,
  input: CreateFloatingIpInput,
): Promise<MutationResult<FloatingIp>> {
  const parsed = parse(floatingIpCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(value.dnsName === undefined && value.dnsDomain === undefined
      ? []
      : [
          {
            feature: "Floating IP DNS records",
            required: NEUTRON_DNS_INTEGRATION_EXTENSION,
          },
        ]),
    ...(value.qosPolicyId === undefined
      ? []
      : [
          {
            feature: "Floating IP QoS policies",
            required: NEUTRON_QOS_FLOATING_IP_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
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
        ...(value.dnsName === undefined ? {} : { dns_name: value.dnsName }),
        ...(value.dnsDomain === undefined
          ? {}
          : { dns_domain: value.dnsDomain }),
        ...(value.qosPolicyId === undefined
          ? {}
          : { qos_policy_id: value.qosPolicyId }),
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
  if (value.qosPolicyId !== undefined) {
    const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
      {
        feature: "Floating IP QoS policies",
        required: NEUTRON_QOS_FLOATING_IP_EXTENSION,
      },
    ]);
    if (unsupported) return unsupported;
  }
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
        ...(value.qosPolicyId === undefined
          ? {}
          : { qos_policy_id: value.qosPolicyId }),
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
  const statefulSupport = scope.regionId
    ? extensionSupport(
        await discoverNetworkCapabilities(scope.regionId),
        NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
        "Security group connection tracking",
      )
    : null;
  if (
    parsed.value.stateful !== undefined &&
    statefulSupport?.status === "unsupported"
  ) {
    return mutationFailure(
      {
        code: "service-unavailable",
        message: statefulSupport.message,
        retryable: false,
      },
      scope,
    );
  }
  const { stateful, ...attributes } = parsed.value;
  const requestedStateful =
    stateful ?? (statefulSupport?.status === "unsupported" ? undefined : true);
  return executeOpenStackMutation({
    actionLabel: "create a security group",
    scope,
    ...NEUTRON_SERVICE,
    path: "/v2.0/security-groups",
    method: "POST",
    body: {
      security_group: {
        ...attributes,
        ...(requestedStateful === undefined
          ? {}
          : { stateful: requestedStateful }),
      },
    },
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
  const parsed = parse(securityGroupUpdateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const unsupported = await unsupportedNetworkExtensionsFailure(scope, [
    ...(parsed.value.stateful === undefined
      ? []
      : [
          {
            feature: "Security group connection tracking",
            required: NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
          },
        ]),
  ]);
  if (unsupported) return unsupported;
  const { stateful, ...attributes } = parsed.value;
  return executeOpenStackMutation({
    actionLabel: "edit this security group",
    scope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/security-groups/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    body: {
      security_group: {
        ...attributes,
        ...(stateful === undefined ? {} : { stateful }),
      },
    },
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

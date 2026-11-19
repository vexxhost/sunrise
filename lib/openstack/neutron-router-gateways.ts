import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import { hasNeutronAdministratorRole } from "@/lib/openstack/neutron-access";
import type {
  KeystoneRole,
  Router,
  RouterExternalGatewayInfo,
} from "@/types/openstack";

export function canManageNeutronAdminOnlyRouterSettings(
  roles: KeystoneRole[] | undefined,
): boolean {
  return hasNeutronAdministratorRole(roles);
}

export function routerCapabilityBooleanInput(
  support: OpenStackFeatureSupport,
  value: boolean,
  writable = true,
): boolean | undefined {
  if (!writable) return undefined;
  if (support.status === "supported") return value;
  if (support.status === "unknown" && value) return true;
  return undefined;
}

export function canAddRouterExternalGateway(
  gateway: RouterExternalGatewayInfo | undefined,
): boolean {
  return Boolean(gateway && !gateway.enable_snat);
}

export function routerExternalGatewayMultihomingAvailable(
  router: Pick<Router, "external_gateways">,
  support: OpenStackFeatureSupport,
): boolean {
  return (
    support.status === "supported" || router.external_gateways !== undefined
  );
}

export function routerExternalGateways(
  router: Pick<Router, "external_gateway_info" | "external_gateways">,
): RouterExternalGatewayInfo[] {
  if (router.external_gateways !== undefined) return router.external_gateways;
  return router.external_gateway_info ? [router.external_gateway_info] : [];
}

export function routerExternalGatewayKey(
  gateway: RouterExternalGatewayInfo,
  unaddressedIndex = 0,
): string {
  const fixedIps = [...gateway.external_fixed_ips]
    .sort(
      (left, right) =>
        left.subnet_id.localeCompare(right.subnet_id) ||
        left.ip_address.localeCompare(right.ip_address),
    )
    .map((fixedIp) => `${fixedIp.subnet_id}:${fixedIp.ip_address}`)
    .join(",");
  return `${gateway.network_id}|${fixedIps || `unaddressed:${unaddressedIndex}`}`;
}

export function canRemoveRouterExternalGateway(
  gateway: RouterExternalGatewayInfo,
  gateways: RouterExternalGatewayInfo[],
): boolean {
  if (gateway.external_fixed_ips.length > 0) return true;
  return (
    gateways.filter((candidate) => candidate.network_id === gateway.network_id)
      .length === 1
  );
}

import type { Router, RouterExternalGatewayInfo } from "@/types/openstack";

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

import "server-only";

import { getSession } from "@/lib/session";
import { OpenStackRequestError } from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import type {
  ManilaAvailabilityZone,
  ManilaExportLocation,
  ManilaShare,
  ManilaShareAccessRule,
  ManilaShareNetwork,
  ManilaShareNetworkSubnet,
  ManilaSecurityService,
  ManilaSecurityServiceNetworkRef,
  ManilaShareSnapshot,
  ManilaShareType,
  Network,
  Subnet,
} from "@/types/openstack";

export const MANILA_API_VERSION = "2.51";

export const MANILA_SERVICE = {
  serviceType: "sharev2",
  serviceName: "manila",
} as const;

function resourceId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255 || /[\\/\r\n]/.test(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return encodeURIComponent(normalized);
}

async function activeManilaContext() {
  const session = await getSession();
  if (!session.projectId || !session.regionId) {
    throw new Error("Select a project and region to use Shared File System.");
  }

  return {
    projectId: session.projectId,
    projectPathId: encodeURIComponent(session.projectId),
    regionId: session.regionId,
  };
}

async function manilaRequest<T>(path: string) {
  const { regionId } = await activeManilaContext();
  return openstackRequest<T>({
    ...MANILA_SERVICE,
    regionId,
    path,
    headers: { "X-OpenStack-Manila-API-Version": MANILA_API_VERSION },
    errorMode: "throw",
  });
}

function normalizeProjectId(value: string) {
  return value.replace(/-/g, "").toLowerCase();
}

function assertActiveProject(
  resourceProjectId: string | undefined,
  activeProjectId: string,
) {
  if (
    resourceProjectId &&
    normalizeProjectId(resourceProjectId) !==
      normalizeProjectId(activeProjectId)
  ) {
    throw new OpenStackRequestError(404, "Not Found");
  }
}

export async function listShares() {
  const { projectId, projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{ shares?: ManilaShare[] }>(
    `/${projectPathId}/shares/detail?all_tenants=0`,
  );
  return (payload?.shares ?? []).filter(
    (share) =>
      !share.project_id ||
      normalizeProjectId(share.project_id) === normalizeProjectId(projectId),
  );
}

export async function getShare(id: string) {
  const { projectId, projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{ share?: ManilaShare }>(
    `/${projectPathId}/shares/${resourceId(id, "share ID")}`,
  );
  if (!payload?.share) throw new Error("Manila did not return the share");
  assertActiveProject(payload.share.project_id, projectId);
  return payload.share;
}

export async function listShareNetworks() {
  const { projectId, projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{
    share_networks?: ManilaShareNetwork[];
  }>(`/${projectPathId}/share-networks/detail?all_tenants=0`);
  return (payload?.share_networks ?? []).filter(
    (network) =>
      !network.project_id ||
      normalizeProjectId(network.project_id) === normalizeProjectId(projectId),
  );
}

export async function getShareNetwork(id: string) {
  const { projectId, projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{ share_network?: ManilaShareNetwork }>(
    `/${projectPathId}/share-networks/${resourceId(id, "share network ID")}`,
  );
  if (!payload?.share_network) {
    throw new Error("Manila did not return the share network");
  }
  assertActiveProject(payload.share_network.project_id, projectId);
  return payload.share_network;
}

export async function listShareNetworkSubnets(shareNetworkId: string) {
  await getShareNetwork(shareNetworkId);
  const { projectPathId } = await activeManilaContext();
  const networkId = resourceId(shareNetworkId, "share network ID");
  const payload = await manilaRequest<{
    share_network_subnets?: ManilaShareNetworkSubnet[];
  }>(`/${projectPathId}/share-networks/${networkId}/subnets`);
  return (payload?.share_network_subnets ?? []).filter(
    (subnet) =>
      !subnet.share_network_id || subnet.share_network_id === shareNetworkId,
  );
}

export async function getShareNetworkSubnet(
  shareNetworkId: string,
  subnetId: string,
) {
  await getShareNetwork(shareNetworkId);
  const { projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{
    share_network_subnet?: ManilaShareNetworkSubnet;
  }>(
    `/${projectPathId}/share-networks/${resourceId(shareNetworkId, "share network ID")}/subnets/${resourceId(subnetId, "share network subnet ID")}`,
  );
  if (!payload?.share_network_subnet) {
    throw new Error("Manila did not return the share network subnet");
  }
  if (
    payload.share_network_subnet.share_network_id &&
    payload.share_network_subnet.share_network_id !== shareNetworkId
  ) {
    throw new OpenStackRequestError(404, "Not Found");
  }
  return payload.share_network_subnet;
}

type ManilaSecurityServiceResponse = Omit<
  ManilaSecurityService,
  "share_networks"
> & {
  password?: string | null;
  share_networks?: Array<string | ManilaSecurityServiceNetworkRef>;
};

export function normalizeSecurityService(
  service: ManilaSecurityServiceResponse,
): ManilaSecurityService {
  const {
    password: _password,
    share_networks: shareNetworks,
    ...safeService
  } = service;
  return {
    ...safeService,
    ...(shareNetworks
      ? {
          share_networks: shareNetworks.map((network) =>
            typeof network === "string" ? { id: network } : network,
          ),
        }
      : {}),
  };
}

export async function listSecurityServices() {
  const { projectId, projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{
    security_services?: ManilaSecurityServiceResponse[];
  }>(`/${projectPathId}/security-services/detail?all_tenants=0`);
  return (payload?.security_services ?? [])
    .filter(
      (service) =>
        !service.project_id ||
        normalizeProjectId(service.project_id) ===
          normalizeProjectId(projectId),
    )
    .map(normalizeSecurityService);
}

export async function getSecurityService(id: string) {
  const { projectId, projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{
    security_service?: ManilaSecurityServiceResponse;
  }>(
    `/${projectPathId}/security-services/${resourceId(id, "security service ID")}`,
  );
  if (!payload?.security_service) {
    throw new Error("Manila did not return the security service");
  }
  assertActiveProject(payload.security_service.project_id, projectId);
  return normalizeSecurityService(payload.security_service);
}

export async function listShareNetworkSecurityServices(shareNetworkId: string) {
  await getShareNetwork(shareNetworkId);
  const services = await listSecurityServices();
  return services.filter((service) =>
    service.share_networks?.some((network) => network.id === shareNetworkId),
  );
}

export async function assertShareNetworkPlacement(
  neutronNetworkId: string,
  neutronSubnetId: string,
) {
  const { projectId, regionId } = await activeManilaContext();
  const [networkPayload, subnetPayload] = await Promise.all([
    openstackRequest<{ network?: Network }>({
      serviceType: "network",
      serviceName: "neutron",
      regionId,
      path: `/v2.0/networks/${resourceId(neutronNetworkId, "network ID")}`,
      errorMode: "throw",
    }),
    openstackRequest<{ subnet?: Subnet }>({
      serviceType: "network",
      serviceName: "neutron",
      regionId,
      path: `/v2.0/subnets/${resourceId(neutronSubnetId, "subnet ID")}`,
      errorMode: "throw",
    }),
  ]);
  if (!networkPayload?.network || !subnetPayload?.subnet) {
    throw new Error("Neutron did not return the selected network placement");
  }

  const network = networkPayload.network;
  const subnet = subnetPayload.subnet;
  assertActiveProject(network.project_id || network.tenant_id, projectId);
  assertActiveProject(subnet.project_id || subnet.tenant_id, projectId);
  if (subnet.network_id !== network.id) {
    throw new OpenStackRequestError(
      400,
      "The selected subnet does not belong to the selected network",
    );
  }
}

export async function listShareSnapshots() {
  const { projectId, projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{ snapshots?: ManilaShareSnapshot[] }>(
    `/${projectPathId}/snapshots/detail?all_tenants=0`,
  );
  return (payload?.snapshots ?? []).filter(
    (snapshot) =>
      !snapshot.project_id ||
      normalizeProjectId(snapshot.project_id) === normalizeProjectId(projectId),
  );
}

export async function getShareSnapshot(id: string) {
  const { projectId, projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{ snapshot?: ManilaShareSnapshot }>(
    `/${projectPathId}/snapshots/${resourceId(id, "share snapshot ID")}`,
  );
  if (!payload?.snapshot) {
    throw new Error("Manila did not return the share snapshot");
  }
  assertActiveProject(payload.snapshot.project_id, projectId);
  return payload.snapshot;
}

export async function listShareTypes() {
  const { projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{
    share_types?: ManilaShareType[];
    volume_types?: ManilaShareType[];
  }>(`/${projectPathId}/types?is_public=all`);
  return payload?.share_types ?? payload?.volume_types ?? [];
}

export async function listManilaAvailabilityZones() {
  const { projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{
    availability_zones?: ManilaAvailabilityZone[];
  }>(`/${projectPathId}/availability-zones`);
  return payload?.availability_zones ?? [];
}

export async function listShareExportLocations(shareId: string) {
  await getShare(shareId);
  const { projectPathId } = await activeManilaContext();
  const payload = await manilaRequest<{
    export_locations?: ManilaExportLocation[];
  }>(
    `/${projectPathId}/shares/${resourceId(shareId, "share ID")}/export_locations`,
  );
  return payload?.export_locations ?? [];
}

export async function listShareAccessRules(shareId: string) {
  await getShare(shareId);
  const { projectPathId } = await activeManilaContext();
  const query = new URLSearchParams({ share_id: shareId });
  const payload = await manilaRequest<{
    access_list?: ManilaShareAccessRule[];
  }>(`/${projectPathId}/share-access-rules?${query}`);
  return payload?.access_list ?? [];
}

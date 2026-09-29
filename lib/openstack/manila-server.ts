import "server-only";

import { getSession } from "@/lib/session";
import { openstackRequest } from "@/lib/openstack/request-server";
import type {
  ManilaAvailabilityZone,
  ManilaExportLocation,
  ManilaShare,
  ManilaShareAccessRule,
  ManilaShareNetwork,
  ManilaShareType,
} from "@/types/openstack";

export const MANILA_API_VERSION = "2.51";

const MANILA_SERVICE = {
  serviceType: "sharev2",
  serviceName: "manilav2",
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
    projectId: encodeURIComponent(session.projectId),
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

export async function listShares() {
  const { projectId } = await activeManilaContext();
  const payload = await manilaRequest<{ shares?: ManilaShare[] }>(
    `/${projectId}/shares/detail?all_tenants=0`,
  );
  return payload?.shares ?? [];
}

export async function getShare(id: string) {
  const { projectId } = await activeManilaContext();
  const payload = await manilaRequest<{ share?: ManilaShare }>(
    `/${projectId}/shares/${resourceId(id, "share ID")}`,
  );
  if (!payload?.share) throw new Error("Manila did not return the share");
  return payload.share;
}

export async function listShareNetworks() {
  const { projectId } = await activeManilaContext();
  const payload = await manilaRequest<{
    share_networks?: ManilaShareNetwork[];
  }>(`/${projectId}/share-networks/detail?all_tenants=0`);
  return (payload?.share_networks ?? []).filter(
    (network) =>
      !network.project_id ||
      network.project_id === decodeURIComponent(projectId),
  );
}

export async function getShareNetwork(id: string) {
  const { projectId } = await activeManilaContext();
  const payload = await manilaRequest<{ share_network?: ManilaShareNetwork }>(
    `/${projectId}/share-networks/${resourceId(id, "share network ID")}`,
  );
  if (!payload?.share_network) {
    throw new Error("Manila did not return the share network");
  }
  return payload.share_network;
}

export async function listShareTypes() {
  const { projectId } = await activeManilaContext();
  const payload = await manilaRequest<{
    share_types?: ManilaShareType[];
    volume_types?: ManilaShareType[];
  }>(`/${projectId}/types?is_public=all`);
  return payload?.share_types ?? payload?.volume_types ?? [];
}

export async function listManilaAvailabilityZones() {
  const { projectId } = await activeManilaContext();
  const payload = await manilaRequest<{
    availability_zones?: ManilaAvailabilityZone[];
  }>(`/${projectId}/availability-zones`);
  return payload?.availability_zones ?? [];
}

export async function listShareExportLocations(shareId: string) {
  const { projectId } = await activeManilaContext();
  const payload = await manilaRequest<{
    export_locations?: ManilaExportLocation[];
  }>(
    `/${projectId}/shares/${resourceId(shareId, "share ID")}/export_locations`,
  );
  return payload?.export_locations ?? [];
}

export async function listShareAccessRules(shareId: string) {
  const { projectId } = await activeManilaContext();
  const query = new URLSearchParams({ share_id: shareId });
  const payload = await manilaRequest<{
    access_list?: ManilaShareAccessRule[];
  }>(`/${projectId}/share-access-rules?${query}`);
  return payload?.access_list ?? [];
}

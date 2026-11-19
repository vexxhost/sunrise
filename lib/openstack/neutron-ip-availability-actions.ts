"use server";

import { parseNetworkIpAvailability } from "@/lib/openstack/neutron-ip-availability";
import { OpenStackRequestError } from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession } from "@/lib/session";
import type { NetworkIpAvailability } from "@/types/openstack";

const SERVICE_TYPE = "network";
const SERVICE_NAME = "neutron";

export type NetworkIpAvailabilityResult =
  | { status: "available"; availability: NetworkIpAvailability }
  | { status: "restricted" };

function normalizeProjectId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

function validResourceId(value: string) {
  return Boolean(value) && value.length <= 255 && !/[\r\n]/.test(value);
}

export async function getNetworkIpAvailability(
  regionId: string,
  projectId: string,
  networkId: string,
): Promise<NetworkIpAvailabilityResult> {
  if (!validResourceId(networkId)) {
    throw new Error("Invalid Neutron network ID");
  }

  const session = await getSession();
  if (!session.regionId || !session.projectId) {
    throw new Error("No active project scope for Neutron request");
  }
  if (regionId !== session.regionId) {
    throw new Error("Neutron region does not match the active session");
  }
  if (normalizeProjectId(projectId) !== normalizeProjectId(session.projectId)) {
    throw new Error("Neutron project does not match the active session");
  }

  try {
    const payload = await openstackRequest<unknown>({
      regionId: session.regionId,
      serviceType: SERVICE_TYPE,
      serviceName: SERVICE_NAME,
      path: `/v2.0/network-ip-availabilities/${encodeURIComponent(networkId)}`,
      errorMode: "throw",
    });
    return {
      status: "available",
      availability: parseNetworkIpAvailability(payload, networkId),
    };
  } catch (error) {
    // Neutron deliberately returns 404 for policy-hidden availability data.
    if (
      error instanceof OpenStackRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return { status: "restricted" };
    }
    throw error;
  }
}

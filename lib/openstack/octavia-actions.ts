"use server";

import {
  getLoadBalancerDetails,
  listLoadBalancers,
} from "@/lib/openstack/octavia-server";
import { listFloatingIpsForPort } from "@/lib/openstack/neutron-floating-ip-server";
import type { NeutronFloatingIpReference } from "@/lib/openstack/neutron-floating-ip-server";
import type {
  OctaviaLoadBalancer,
  OctaviaLoadBalancerDetails,
} from "@/types/openstack";

export async function listLoadBalancersAction(
  regionId?: string,
  projectId?: string,
): Promise<OctaviaLoadBalancer[]> {
  return listLoadBalancers(regionId, projectId);
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

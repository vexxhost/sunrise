import "server-only";

import {
  microversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import {
  discoverLoadBalancerCapabilities,
  OCTAVIA_TAGS_MICROVERSION,
} from "@/lib/openstack/capabilities-server";
import { OpenStackRequestError } from "@/lib/openstack/request";

export async function readWithOctaviaLoadBalancerTags<T>(
  regionId: string,
  read: (apiVersion?: string) => Promise<T>,
  knownCapabilities?: OpenStackServiceCapabilities,
): Promise<{ data: T; requestedTags: boolean }> {
  const capabilities =
    knownCapabilities ?? (await discoverLoadBalancerCapabilities(regionId));
  const support = microversionSupport(
    capabilities,
    OCTAVIA_TAGS_MICROVERSION,
    "Load balancer tags",
  );
  if (support.status !== "unsupported") {
    const apiVersion =
      support.requestedMicroversion ?? OCTAVIA_TAGS_MICROVERSION;
    try {
      return {
        data: await read(`load-balancer ${apiVersion}`),
        requestedTags: true,
      };
    } catch (error) {
      if (
        support.status !== "unknown" ||
        !(error instanceof OpenStackRequestError) ||
        (error.status !== 400 && error.status !== 406)
      ) {
        throw error;
      }
    }
  }
  return { data: await read(), requestedTags: false };
}

import { queryOptions } from "@tanstack/react-query";

import { openstack } from "@/lib/openstack/actions";
import type { ManilaShareNetwork } from "@/types/openstack";

export function shareNetworksQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share-networks"],
    queryFn: async () => {
      const data = await openstack<{ share_networks: ManilaShareNetwork[] }>({
        regionId: regionId!,
        serviceType: "sharev2",
        serviceName: "manilav2",
        path: `/${encodeURIComponent(projectId!)}/share-networks/detail?all_tenants=0`,
        headers: { "X-OpenStack-Manila-API-Version": "2.51" },
      });

      return (data?.share_networks ?? []).filter(
        (network) => !network.project_id || network.project_id === projectId,
      );
    },
    enabled: !!regionId && !!projectId,
  });
}

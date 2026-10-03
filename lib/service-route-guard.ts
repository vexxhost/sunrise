import "server-only";

import { getServicePolicy } from "@/lib/deployment-config";
import {
  isServiceEnabled,
  type OpenStackServiceId,
} from "@/lib/service-policy";

export function unavailableServiceRouteResponse(
  serviceId: OpenStackServiceId,
  regionId?: string | null,
) {
  if (isServiceEnabled(getServicePolicy(), serviceId, regionId)) return null;

  return Response.json(
    {
      ok: false,
      error:
        "This service is disabled by the Sunrise deployment configuration.",
    },
    { status: 404 },
  );
}
